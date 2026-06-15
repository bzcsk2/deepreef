/**
 * WorkflowStatusBar — Workflow 状态栏组件
 *
 * SFR-80: 根据 mode + lifecycle 显示真实状态。
 * - alone/subagent: 仅显示模式 + 角色状态，不显示 workflow phase/goal
 * - loop: 显示 lifecycle、phase、iteration/maxRounds、goal、blocked 原因
 */

import { Box, Text } from '@deepreef/ink';
import { FG, TONE } from '../../reasonix/tokens.js';
import type { WorkflowLifecycle } from '../../workflow-mode-router.js';

/** Workflow 阶段类型 */
export type WorkflowPhase =
  | 'idle'
  | 'supervisor_analyse'
  | 'worker_do'
  | 'worker_report'
  | 'supervisor_check'
  | 'continue'
  | 'revise'
  | 'approve'
  | 'blocked'
  | 'ask_user';

/** Workflow 状态 */
export interface WorkflowState {
  phase: WorkflowPhase;
  iteration: number;
  maxRounds: number;
  goal: string;
  supervisorStatus: 'idle' | 'analyse' | 'waiting' | 'blocked';
  workerStatus: 'idle' | 'do' | 'report' | 'waiting' | 'blocked';
}

/** WorkflowStatusBar 属性 */
export interface WorkflowStatusBarProps {
  workflow: WorkflowState;
  lifecycle: WorkflowLifecycle;
  activeRole?: 'worker' | 'supervisor';
  workflowMode?: 'alone' | 'subagent' | 'loop';
  width?: number;
}

/** 阶段显示映射 */
const PHASE_DISPLAY: Record<string, { label: string; prefix: string; color: string }> = {
  idle: { label: 'idle', prefix: '', color: FG.faint },
  supervisor_analyse: { label: 'analyse', prefix: '[D]', color: TONE.brand },
  worker_do: { label: 'do', prefix: '[W]', color: TONE.ok },
  worker_report: { label: 'report', prefix: '[W]', color: TONE.ok },
  supervisor_check: { label: 'check', prefix: '[D]', color: TONE.brand },
  continue: { label: 'continue', prefix: '[D]', color: TONE.brand },
  revise: { label: 'revise', prefix: '[D]', color: TONE.warn },
  approve: { label: 'approve', prefix: '[D]', color: TONE.ok },
  blocked: { label: 'blocked', prefix: '', color: TONE.error },
  ask_user: { label: 'ask_user', prefix: '', color: TONE.warn },
};

const LIFECYCLE_DISPLAY: Record<string, { label: string; color: string }> = {
  idle: { label: '', color: FG.faint },
  awaiting_goal: { label: 'awaiting_goal', color: TONE.accent },
  running: { label: 'running', color: TONE.brand },
  waiting_user: { label: 'waiting', color: TONE.warn },
  blocked: { label: 'blocked', color: TONE.error },
  completed: { label: 'completed', color: TONE.ok },
  failed: { label: 'failed', color: TONE.error },
};

/** 角色状态显示映射 */
const ROLE_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  idle: { label: 'idle', color: FG.faint },
  analyse: { label: 'analyse', color: TONE.brand },
  do: { label: 'do', color: TONE.ok },
  report: { label: 'report', color: TONE.ok },
  waiting: { label: 'wait', color: FG.sub },
  blocked: { label: 'blocked', color: TONE.error },
};

function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 3) + '...';
}

const MODE_DISPLAY: Record<string, { label: string; color: string }> = {
  alone: { label: 'alone', color: FG.faint },
  subagent: { label: 'subagent', color: TONE.accent },
  loop: { label: 'loop', color: TONE.brand },
};

/**
 * WorkflowStatusBar 组件
 */
export function WorkflowStatusBar({
  workflow,
  lifecycle,
  activeRole,
  workflowMode = 'alone',
  width = 80,
}: WorkflowStatusBarProps) {
  const { phase, iteration, maxRounds, goal, supervisorStatus, workerStatus } = workflow;
  const modeDisplay = MODE_DISPLAY[workflowMode] ?? MODE_DISPLAY.alone;
  const supervisorDisplay = ROLE_STATUS_DISPLAY[supervisorStatus] ?? ROLE_STATUS_DISPLAY.idle;
  const workerDisplay = ROLE_STATUS_DISPLAY[workerStatus] ?? ROLE_STATUS_DISPLAY.idle;

  return (
    <Box width="100%" flexDirection="row" paddingX={1}>
      <Text color={FG.faint}>{' | '}</Text>
      <Text bold color={modeDisplay.color as any}>{modeDisplay.label}</Text>

      {/* SFR-80: loop 模式显示 lifecycle + phase */}
      {workflowMode === 'loop' && (
        <>
          <Text color={FG.faint}>{' | '}</Text>
          <Text color={(LIFECYCLE_DISPLAY[lifecycle.status] ?? LIFECYCLE_DISPLAY.idle).color as any}>
            {(LIFECYCLE_DISPLAY[lifecycle.status] ?? LIFECYCLE_DISPLAY.idle).label}
          </Text>
          {lifecycle.status === 'running' && phase !== 'idle' && (
            <>
              <Text color={FG.faint}>{' '}</Text>
              <Text color={(PHASE_DISPLAY[phase] ?? PHASE_DISPLAY.idle).color as any}>
                {PHASE_DISPLAY[phase]?.prefix ? `${PHASE_DISPLAY[phase].prefix} ` : ''}{PHASE_DISPLAY[phase]?.label ?? phase}
              </Text>
              <Text color={FG.sub}>{` (${iteration}/${maxRounds})`}</Text>
            </>
          )}
          {lifecycle.status === 'blocked' && (
            <Text color={TONE.error}>{` blocked`}</Text>
          )}
        </>
      )}

      <Text color={FG.faint}>{' | '}</Text>

      <Box flexDirection="row" alignItems="center">
        <Text color={FG.faint}>S</Text>
        <Box backgroundColor={activeRole === 'supervisor' ? TONE.brand : undefined} paddingX={1}>
          <Text
            bold={activeRole === 'supervisor'}
            color={activeRole === 'supervisor' ? '#000' : supervisorDisplay.color as any}
          >
            {supervisorDisplay.label}
          </Text>
        </Box>
      </Box>

      <Text color={FG.faint}>{' | '}</Text>

      <Box flexDirection="row" alignItems="center">
        <Text color={FG.faint}>W</Text>
        <Box backgroundColor={activeRole === 'worker' ? TONE.ok : undefined} paddingX={1}>
          <Text
            bold={activeRole === 'worker'}
            color={activeRole === 'worker' ? '#000' : workerDisplay.color as any}
          >
            {workerDisplay.label}
          </Text>
        </Box>
      </Box>

      {/* SFR-80: loop 模式显示 goal */}
      {workflowMode === 'loop' && (
        <>
          <Text color={FG.faint}>{' | '}</Text>
          <Box flexGrow={1}>
            <Text color={FG.sub}>
              {goal ? truncateText(goal, Math.max(10, width - 50)) : lifecycle.status === 'awaiting_goal' ? 'awaiting goal' : ''}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
