import React, { useState, useCallback, useEffect } from 'react';
import type { EvalCategory, EvalSuite, EvalEnvironmentId, EvalCategoryId } from '@deepreef/core';
import { getCategories, getCategory, getSuite, getFilteredSuites } from '@deepreef/core/eval/registry.js';
import { EvalCategorySelect } from './EvalCategorySelect.js';
import { EvalSuiteSelect } from './EvalSuiteSelect.js';
import { EvalEnvironmentSelect } from './EvalEnvironmentSelect.js';

type EvalWizardStep = 'category' | 'environment' | 'suite';

interface Props {
  onDone: () => void;
  onStart: (categoryId: string, suiteId: string, environmentId: EvalEnvironmentId) => void;
  initialCategoryId?: string;
  initialSuiteId?: string;
  initialEnvironmentId?: string;
}

export function EvalWizard({ onDone, onStart, initialCategoryId, initialSuiteId, initialEnvironmentId }: Props): React.ReactElement | null {
  const [step, setStep] = useState<EvalWizardStep>(() => {
    if (initialCategoryId && initialSuiteId) {
      const cat = getCategory(initialCategoryId as any);
      const suite = getSuite(initialCategoryId as any, initialSuiteId as any);
      if (cat && suite) return 'suite';
    }
    if (initialCategoryId) {
      const cat = getCategory(initialCategoryId as any);
      if (cat) return 'environment';
    }
    return 'category';
  });
  const [selectedCategory, setSelectedCategory] = useState<EvalCategory | null>(() =>
    initialCategoryId ? getCategory(initialCategoryId as any) ?? null : null,
  );
  const [selectedEnvironment, setSelectedEnvironment] = useState<EvalEnvironmentId>(() =>
    (initialEnvironmentId as EvalEnvironmentId) ?? 'sandbox',
  );
  useEffect(() => {
    if (initialCategoryId && initialSuiteId) {
      const cat = getCategory(initialCategoryId as any);
      const suite = getSuite(initialCategoryId as any, initialSuiteId as any);
      if (cat && suite) {
        onStart(cat.id, suite.id, selectedEnvironment);
        onDone();
      }
    }
  }, [initialCategoryId, initialSuiteId, onDone, onStart, selectedEnvironment]);

  const handleCategorySelect = useCallback((cat: EvalCategory) => {
    setSelectedCategory(cat);
    setStep('environment');
  }, []);

  const handleEnvironmentSelect = useCallback((envId: EvalEnvironmentId) => {
    setSelectedEnvironment(envId);
    const filtered = selectedCategory ? getFilteredSuites(selectedCategory.id as EvalCategoryId, envId) : [];
    if (selectedCategory && filtered.length === 1) {
      const onlySuite = filtered[0]!;
      onStart(selectedCategory.id, onlySuite.id, envId);
      onDone();
      return;
    }
    setStep('suite');
  }, [onDone, onStart, selectedCategory]);

  const handleSuiteSelect = useCallback((suite: EvalSuite) => {
    const cat = selectedCategory;
    if (!cat) return;
    onStart(cat.id, suite.id, selectedEnvironment);
    onDone();
  }, [onDone, onStart, selectedCategory, selectedEnvironment]);

  const handleCancelCategory = useCallback(() => {
    onDone();
  }, [onDone]);

  const handleCancelEnvironment = useCallback(() => {
    setStep('category');
  }, []);

  const handleCancelSuite = useCallback(() => {
    setStep('environment');
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
    case 'environment':
      return (
        <EvalEnvironmentSelect
          onSelect={handleEnvironmentSelect}
          onCancel={handleCancelEnvironment}
        />
      );
    case 'suite':
      return (
        <EvalSuiteSelect
          category={selectedCategory!}
          environmentId={selectedEnvironment}
          onSelect={handleSuiteSelect}
          onCancel={handleCancelSuite}
        />
      );
  }
}
