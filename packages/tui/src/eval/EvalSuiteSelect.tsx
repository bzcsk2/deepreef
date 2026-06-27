import React, { useState } from 'react';
import { Box, Text, useInput } from '@deepreef/ink';
import type { EvalCategory, EvalSuite } from '@deepreef/core';
import { ModalShell } from '../ModalShell.js';
import { FG, TONE } from '../reasonix/tokens.js';

interface Props {
  category: EvalCategory;
  onSelect: (suite: EvalSuite) => void;
  onCancel: () => void;
}

export function EvalSuiteSelect({ category, onSelect, onCancel }: Props): React.ReactElement {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const suites = category.suites;

  useInput((_input, key) => {
    if (key.escape || (key.ctrl && _input === 'c')) {
      onCancel();
      return;
    }
    if (suites.length === 0) return;
    if (key.upArrow) {
      setSelectedIdx(prev => (prev - 1 + suites.length) % suites.length);
    }
    if (key.downArrow) {
      setSelectedIdx(prev => (prev + 1) % suites.length);
    }
    if (key.return) {
      onSelect(suites[selectedIdx]);
    }
  });

  return (
    <ModalShell
      title={`Suites — ${category.title}`}
      subtitle={category.description}
      onCancel={onCancel}
    >
      <Box flexDirection="column" gap={1}>
        {suites.map((suite, i) => (
          <Box key={suite.id} flexDirection="row">
            <Text color={i === selectedIdx ? TONE.brand : FG.faint}>
              {i === selectedIdx ? '❯ ' : '  '}
            </Text>
            <Text bold={i === selectedIdx} color={i === selectedIdx ? TONE.brand : FG.body}>
              {suite.title}
            </Text>
            <Text color={FG.faint}> — {suite.description}</Text>
            <Text color={FG.faint}>
              {' '}({suite.cases.length} cases, ~{suite.estimatedMinutes})
            </Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text dimColor>↑↓ select · Enter confirm · Esc back</Text>
        </Box>
      </Box>
    </ModalShell>
  );
}
