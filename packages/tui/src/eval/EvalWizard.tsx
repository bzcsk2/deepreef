import React, { useState, useCallback } from 'react';
import type { EvalCategory, EvalSuite } from '@deepreef/core';
import { getCategories } from '@deepreef/core';
import { EvalCategorySelect } from './EvalCategorySelect.js';
import { EvalSuiteSelect } from './EvalSuiteSelect.js';

type EvalWizardStep = 'category' | 'suite';

interface Props {
  onDone: () => void;
  onStart: (categoryId: string, suiteId: string) => void;
}

export function EvalWizard({ onDone, onStart }: Props): React.ReactElement {
  const [step, setStep] = useState<EvalWizardStep>('category');
  const [selectedCategory, setSelectedCategory] = useState<EvalCategory | null>(null);
  const categories = getCategories();

  const handleCategorySelect = useCallback((category: EvalCategory) => {
    setSelectedCategory(category);
    setStep('suite');
  }, []);

  const handleSuiteSelect = useCallback((suite: EvalSuite) => {
    if (!selectedCategory) {
      onDone();
      return;
    }
    onStart(selectedCategory.id, suite.id);
    onDone();
  }, [onDone, onStart, selectedCategory]);

  const handleCancelSuite = useCallback(() => {
    setSelectedCategory(null);
    setStep('category');
  }, []);

  if (step === 'suite' && selectedCategory) {
    return (
      <EvalSuiteSelect
        category={selectedCategory}
        onSelect={handleSuiteSelect}
        onCancel={handleCancelSuite}
      />
    );
  }

  return (
    <EvalCategorySelect
      categories={categories}
      onSelect={handleCategorySelect}
      onCancel={onDone}
    />
  );
}
