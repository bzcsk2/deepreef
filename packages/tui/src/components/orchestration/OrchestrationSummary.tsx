/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Three-column orchestration summary — new_tui card style.
 *   Local Workers | Supervisor | Loop State
 *
 * Uses Ink's FG / TONE tokens (mirroring tokens.ts / new_tui palette):
 *   brand  #3b82f6 (blue)   — running, active
 *   accent #a855f7 (purple) — verifying, reviewing
 *   ok     #00ff41 (green)  — completed, done
 *   warn   #f59e0b (amber)  — waiting, paused, cooldown
 *   err    #ef4444 (red)    — failed, cancelled
 */

import React from 'react';
import { Box, Text } from '@deepreef/ink';
import { FG, TONE, SURFACE } from '../../reasonix/tokens.js';
import type { WorkerDisplayData, WorkerStatus } from '../agents/AgentGroupDisplay.js';

export interface SupervisorDisplayData {
  id: string;
  modelName: string;
  status: 'reviewing' | 'idle' | 'cooldown' | 'unavailable';
  reviewingWorkerId?: string;
  lastAdvice?: string;
}

export type LoopPhase =
  | 'observe' | 'plan' | 'act' | 'verify' | 'reflect'
  | 'retry' | 'paused' | 'done' | 'failed';

interface OrchestrationSummaryProps {
  workers: WorkerDisplayData[];
  supervisors: SupervisorDisplayData[];
  loopPhase: LoopPhase;
  loopAttempt?: number;
  terminalWidth: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/* ── status helpers ── */

type CardAccent = 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'gray';
const ACCENT_COLORS: Record<CardAccent, string> = {
  blue: TONE.brand, purple: TONE.accent, green: TONE.ok,
  amber: TONE.warn, red: TONE.err, gray: FG.meta,
};

function workerAccent(status: WorkerStatus): CardAccent {
  switch (status) {
    case 'running': return 'blue';
    case 'completed': return 'green';
    case 'failed': case 'cancelled': return 'red';
    case 'waiting_permission': case 'waiting_question': case 'waiting_supervisor':
    case 'paused': return 'amber';
    case 'verifying': return 'purple';
    default: return 'gray';
  }
}

function workerLabel(status: WorkerStatus): string {
  switch (status) {
    case 'running': return 'RUNNING'; case 'completed': return 'DONE';
    case 'failed': return 'FAILED'; case 'cancelled': return 'CANCELLED';
    case 'waiting_permission': return 'PERMISSION'; case 'waiting_question': return 'QUESTION';
    case 'waiting_supervisor': return 'SUPERVISOR'; case 'paused': return 'PAUSED';
    case 'verifying': return 'VERIFY'; case 'starting': return 'STARTING';
    case 'queued': return 'QUEUED'; case 'idle': return 'IDLE';
  }
}

function supervisorAccent(status: SupervisorDisplayData['status']): CardAccent {
  switch (status) {
    case 'reviewing': return 'purple';
    case 'idle': return 'gray';
    case 'cooldown': return 'amber';
    case 'unavailable': return 'red';
    default: return 'gray';
  }
}

function supervisorLabel(status: SupervisorDisplayData['status']): string {
  switch (status) {
    case 'reviewing': return 'REVIEWING'; case 'idle': return 'IDLE';
    case 'cooldown': return 'COOLDOWN'; case 'unavailable': return 'OFFLINE';
  }
}

function loopAccent(phase: LoopPhase): CardAccent {
  switch (phase) {
    case 'done': return 'green'; case 'failed': return 'red';
    case 'paused': return 'amber';
    case 'act': case 'verify': return 'blue';
    case 'reflect': case 'plan': return 'purple';
    default: return 'gray';
  }
}

function loopIcon(phase: LoopPhase): string {
  switch (phase) {
    case 'observe': return '◎'; case 'plan': return '⚙'; case 'act': return '⚡';
    case 'verify': return '✓'; case 'reflect': return '◎'; case 'retry': return '↻';
    case 'paused': return '⏸'; case 'done': return '✔'; case 'failed': return '✖';
    default: return '○';
  }
}

function loopLabel(phase: LoopPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/* ── sub-components ── */

/** single card with left accent border */
const AccentCard: React.FC<{ accent: CardAccent; children: React.ReactNode; width: number }> = ({ accent, children, width }) => (
  <Box flexDirection="column" width={width} paddingX={1}>
    <Box flexDirection="row">
      {/* left accent bar */}
      <Box width={1} marginRight={1}>
        <Box flexGrow={1}>
          <Text backgroundColor={ACCENT_COLORS[accent] as any}>{' '}</Text>
        </Box>
      </Box>
      <Box flexDirection="column" width={width - 4} backgroundColor={SURFACE.bgCode as any}>
        {children}
      </Box>
    </Box>
  </Box>
);

/** status badge: bg accent at 15% + text */
const Badge: React.FC<{ accent: CardAccent; label: string }> = ({ accent, label }) => (
  <Text color={ACCENT_COLORS[accent] as any} bold>{label}</Text>
);

/** compact header row for each column */
const ColHead: React.FC<{ title: string }> = ({ title }) => (
  <Box marginBottom={1}>
    <Text color={FG.meta as any} bold>{title.toUpperCase()}</Text>
  </Box>
);

/* ── main component ── */

export const OrchestrationSummary: React.FC<OrchestrationSummaryProps> = ({
  workers,
  supervisors,
  loopPhase,
  loopAttempt,
  terminalWidth,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const colWidth = Math.floor(terminalWidth / 3);

  const activeWorkers = workers.filter(w => w.status === 'running' || w.status === 'starting').length;
  const totalWorkers = workers.length;
  const wAccent: CardAccent = activeWorkers > 0 ? 'blue' : 'gray';
  const wGlyph = activeWorkers > 0 ? '●' : '○';

  const activeSup = supervisors.filter(s => s.status === 'reviewing').length;
  const sAccent: CardAccent = activeSup > 0 ? 'purple' : 'gray';
  const sGlyph = activeSup > 0 ? '●' : '○';

  return (
    <Box flexDirection="row" width={terminalWidth}>
      {/* ── Column 1: Workers ── */}
      <AccentCard accent={wAccent} width={colWidth}>
        <Box flexDirection="row" paddingX={1} paddingY={1}>
          <Text color={ACCENT_COLORS[wAccent] as any}>{wGlyph} </Text>
          <ColHead title="Workers" />
          <Box flexGrow={1} />
          <Text color={FG.faint as any}>{totalWorkers > 0 ? `${activeWorkers}/${totalWorkers}` : ''}</Text>
        </Box>
        {workers.length === 0 ? (
          <Box paddingX={1} paddingBottom={1}>
            <Text color={FG.faint as any}>No active workers</Text>
          </Box>
        ) : (
          workers.slice(0, 4).map(w => (
            <Box key={w.id} flexDirection="row" paddingX={1}>
              <Badge accent={workerAccent(w.status)} label={workerLabel(w.status)} />
              <Box flexGrow={1} />
              <Text color={FG.meta as any}>{truncate(w.modelName, 10)}</Text>
            </Box>
          ))
        )}
      </AccentCard>

      {/* ── Column 2: Supervisor ── */}
      <AccentCard accent={sAccent} width={colWidth}>
        <Box flexDirection="row" paddingX={1} paddingY={1}>
          <Text color={ACCENT_COLORS[sAccent] as any}>{sGlyph} </Text>
          <ColHead title="Supervisor" />
          <Box flexGrow={1} />
          <Text color={FG.faint as any}>{supervisors.length > 0 ? String(supervisors.length) : ''}</Text>
        </Box>
        {supervisors.length === 0 ? (
          <Box paddingX={1} paddingBottom={1}>
            <Text color={FG.faint as any}>No supervisor</Text>
          </Box>
        ) : (
          supervisors.slice(0, 2).map(s => (
            <Box key={s.id} flexDirection="row" paddingX={1}>
              <Badge accent={supervisorAccent(s.status)} label={supervisorLabel(s.status)} />
              <Box flexGrow={1} />
              <Text color={FG.meta as any}>{truncate(s.modelName, 10)}</Text>
            </Box>
          ))
        )}
      </AccentCard>

      {/* ── Column 3: Loop State ── */}
      <AccentCard accent={loopAccent(loopPhase)} width={colWidth}>
        <Box flexDirection="row" paddingX={1} paddingY={1}>
          <Text color={ACCENT_COLORS[loopAccent(loopPhase)] as any}>{loopIcon(loopPhase)} </Text>
          <ColHead title="Loop" />
          <Box flexGrow={1} />
          {loopAttempt !== undefined && (
            <Text color={FG.faint as any}>#{loopAttempt}</Text>
          )}
        </Box>
        <Box paddingX={1} paddingBottom={1}>
          <Badge accent={loopAccent(loopPhase)} label={loopLabel(loopPhase).toUpperCase()} />
        </Box>
      </AccentCard>
    </Box>
  );
};
