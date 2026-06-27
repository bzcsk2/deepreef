import React from 'react';
import { Box, Text } from '@deepreef/ink';
import type { EvalCategoryId, EvalSuiteId, EvalProgressEvent, EvalEnvironmentId } from '@deepreef/core';
import { ModalShell } from '../ModalShell.js';
import { FG, TONE } from '../reasonix/tokens.js';
import { Spinner } from '../Spinner.js';

interface Props {
  categoryId: EvalCategoryId;
  suiteId: EvalSuiteId;
  environmentId?: EvalEnvironmentId;
  latestEvent: EvalProgressEvent | null;
  onCancel: () => void;
}

export function EvalRunPanel({ categoryId, suiteId, environmentId, latestEvent, onCancel }: Props): React.ReactElement {
  const progressText = latestEvent
    ? `[${latestEvent.completedCases ?? 0}/${latestEvent.totalCases ?? '?'}]`
    : '[0/?]';

  return (
    <ModalShell
      title={`Running Eval — ${categoryId}/${suiteId}`}
      subtitle={`env=${environmentId ?? 'sandbox'} ${progressText}`}
      onCancel={onCancel}
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row">
          <Spinner loading />
          <Text> Eval in progress... (ESC to cancel)</Text>
        </Box>

        {latestEvent && latestEvent.type === 'case-start' && (
          <Box marginTop={1}>
            <Text color={TONE.brand}>
              Running: {latestEvent.caseId} — {latestEvent.title}
            </Text>
          </Box>
        )}

        {latestEvent && latestEvent.type === 'case-end' && latestEvent.result && (
          <Box marginTop={1}>
            <Text>
              {latestEvent.result.caseId}:{' '}
              <Text color={latestEvent.result.verdict === 'pass' ? TONE.ok : TONE.err} bold>
                {latestEvent.result.verdict}
              </Text>
              <Text color={FG.faint}>
                {' '}score: {latestEvent.result.score?.finalScore.toFixed(1) ?? 'N/A'}
              </Text>
            </Text>
          </Box>
        )}

        {latestEvent && latestEvent.type === 'error' && (
          <Box marginTop={1}>
            <Text color={TONE.err}>Error: {latestEvent.error}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>ESC to cancel current run</Text>
        </Box>
      </Box>
    </ModalShell>
  );
}
