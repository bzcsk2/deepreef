import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EvalCategory, EvalSuite, EvalSuiteId, EvalProgressEvent, EvalRunReport } from '@deepreef/core';
import { getCategories, getCategory, getSuite, runFixedEval, saveEvalReport } from '@deepreef/core';
import { EvalCategorySelect } from './EvalCategorySelect.js';
import { EvalSuiteSelect } from './EvalSuiteSelect.js';
import { EvalRunPanel } from './EvalRunPanel.js';
import { EvalSummaryPanel } from './EvalSummaryPanel.js';

type EvalWizardStep = 'category' | 'suite' | 'running' | 'summary';

interface Props {
  onAppendMessage: (content: string) => void;
  onDone: () => void;
  executeWorker?: (prompt: string) => Promise<string>;
  executeSupervisor?: (prompt: string) => Promise<string>;
  initialCategoryId?: string;
  initialSuiteId?: string;
  registerAbortController?: (ac: AbortController | null) => void;
}

export function EvalWizard({ onAppendMessage, onDone, executeWorker, executeSupervisor, initialCategoryId, initialSuiteId, registerAbortController }: Props): React.ReactElement | null {
  const [step, setStep] = useState<EvalWizardStep>(() => {
    if (initialCategoryId && initialSuiteId) {
      const cat = getCategory(initialCategoryId as any);
      const suite = getSuite(initialCategoryId as any, initialSuiteId as any);
      if (cat && suite) return 'running';
    }
    if (initialCategoryId) {
      const cat = getCategory(initialCategoryId as any);
      if (cat) return 'suite';
    }
    return 'category';
  });
  const [selectedCategory, setSelectedCategory] = useState<EvalCategory | null>(() =>
    initialCategoryId ? getCategory(initialCategoryId as any) ?? null : null,
  );
  const [selectedSuiteId, setSelectedSuiteId] = useState<EvalSuiteId | null>(() =>
    initialCategoryId && initialSuiteId ? initialSuiteId as any : null,
  );
  const [latestEvent, setLatestEvent] = useState<EvalProgressEvent | null>(null);
  const [report, setReport] = useState<EvalRunReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (initialCategoryId && initialSuiteId && !startedRef.current) {
      startedRef.current = true;
      const cat = getCategory(initialCategoryId as any);
      const suite = getSuite(initialCategoryId as any, initialSuiteId as any);
      if (cat && suite) {
        handleSuiteSelect(suite);
      }
    }
  }, []);

  const handleCategorySelect = useCallback((cat: EvalCategory) => {
    setSelectedCategory(cat);
    setStep('suite');
  }, []);

  const handleSuiteSelect = useCallback((suite: EvalSuite) => {
    const cat = selectedCategory;
    if (!cat) {
      onAppendMessage('Error: no category selected');
      onDone();
      return;
    }
    setSelectedSuiteId(suite.id);
    setStep('running');
    setLatestEvent(null);
    const ac = new AbortController();
    abortRef.current = ac;
    registerAbortController?.(ac);

    onAppendMessage(`Starting eval: ${cat.id}/${suite.id} (${suite.cases.length} cases)`);

    runFixedEval({
      categoryId: cat.id,
      suiteId: suite.id,
      executeWorker,
      executeSupervisor,
      onProgress: (event) => {
        setLatestEvent(event);
      },
      abortSignal: ac.signal,
    }).then(async (r) => {
      const { summaryMd, reportDir } = await saveEvalReport(r);
      setReport(r);
      setStep('summary');
      onAppendMessage(`Eval complete! Report saved at: ${reportDir}`);
    }).catch((err: unknown) => {
      registerAbortController?.(null);
      if ((err as Error)?.message?.includes('aborted')) {
        onAppendMessage('Eval cancelled.');
      } else {
        onAppendMessage(`Eval error: ${err instanceof Error ? err.message : String(err)}`);
      }
      onDone();
    });
  }, [selectedCategory, executeWorker, executeSupervisor, registerAbortController, onAppendMessage, onDone]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    registerAbortController?.(null);
    onDone();
  }, [onDone, registerAbortController]);

  const handleCloseSummary = useCallback(() => {
    registerAbortController?.(null);
    onDone();
  }, [onDone, registerAbortController]);

  const handleCancelCategory = useCallback(() => {
    registerAbortController?.(null);
    onDone();
  }, [onDone, registerAbortController]);

  const handleCancelSuite = useCallback(() => {
    setStep('category');
    setSelectedCategory(null);
  }, []);

  const categories = getCategories();

  switch (step) {
    case 'category':
      return (
        <EvalCategorySelect
          categories={categories}
          onSelect={handleCategorySelect}
          onCancel={handleCancelCategory}
        />
      );
    case 'suite':
      return (
        <EvalSuiteSelect
          category={selectedCategory!}
          onSelect={handleSuiteSelect}
          onCancel={handleCancelSuite}
        />
      );
    case 'running':
      if (!selectedCategory || !selectedSuiteId) {
        return <EvalCategorySelect categories={categories} onSelect={handleCategorySelect} onCancel={handleCancelCategory} />;
      }
      return (
        <EvalRunPanel
          categoryId={selectedCategory.id}
          suiteId={selectedSuiteId}
          latestEvent={latestEvent}
          onCancel={handleCancel}
        />
      );
    case 'summary':
      return report ? (
        <EvalSummaryPanel report={report} onClose={handleCloseSummary} />
      ) : null;
  }
}
