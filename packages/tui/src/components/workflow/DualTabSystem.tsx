/**
 * DualTabSystem — 双角色输入目标选择器
 *
 * 功能：
 * - Tab 切换输入目标（Worker/Supervisor）
 * - 显示当前活跃角色指示
 * - 无覆盖层、无 Question/Permission、无自动补全候选时，Tab 切换目标
 * - 自动补全打开时 Tab 保留原用途；Question、Permission 和危险确认优先
 *
 * 注意：根据设计文档 6.3，Tab 只切换输入目标，不切换主时间线。
 * 统一时间线由 DeepiMessages 组件渲染。
 */

import { useInput } from '@deepreef/ink';
import { Box, Text } from '@deepreef/ink';
import { FG, TONE } from '../../reasonix/tokens.js';

/** 角色类型 */
export type AgentRole = 'worker' | 'supervisor';

/** Tab 状态 */
export interface TabState {
  role: AgentRole;
  draft: string;
  scrollPosition: number;
}

/** DualTabSystem 属性 */
export interface DualTabSystemProps {
  /** 当前激活的 Tab */
  activeRole: AgentRole;
  /** Tab 切换回调 */
  onRoleChange: (role: AgentRole) => void;
  /** 是否禁用 Tab 切换 */
  disabled?: boolean;
  /** 终端宽度 */
  width?: number;
}

/**
 * DualTabSystem 组件 — 简化为输入目标选择器
 */
export function DualTabSystem({
  activeRole,
  onRoleChange,
  disabled = false,
  width = 80,
}: DualTabSystemProps) {
  // 处理 Tab 键切换
  useInput(
    (input, key) => {
      if (disabled) return;
      if (key.tab) {
        const newRole = activeRole === 'worker' ? 'supervisor' : 'worker';
        onRoleChange(newRole);
      }
    },
    { isActive: !disabled }
  );

  // 计算 Tab 标题宽度
  const tabTitleWidth = Math.floor(width / 2);

  return (
    <Box width="100%" flexDirection="row">
      <Box
        width={tabTitleWidth}
        justifyContent="center"
        borderStyle="round"
        borderColor={activeRole === 'supervisor' ? TONE.brand : FG.faint}
        paddingX={1}
      >
        <Text
          bold={activeRole === 'supervisor'}
          color={activeRole === 'supervisor' ? TONE.brand : FG.faint}
        >
          Supervisor
        </Text>
      </Box>
      <Box
        width={tabTitleWidth}
        justifyContent="center"
        borderStyle="round"
        borderColor={activeRole === 'worker' ? TONE.ok : FG.faint}
        paddingX={1}
      >
        <Text
          bold={activeRole === 'worker'}
          color={activeRole === 'worker' ? TONE.ok : FG.faint}
        >
          Worker
        </Text>
      </Box>
      <Box flexGrow={1} justifyContent="flex-end">
        <Text color={FG.faint}>{`→ ${activeRole === 'worker' ? 'Worker' : 'Supervisor'}`}</Text>
      </Box>
    </Box>
  );
}

/**
 * Tab 标题组件
 */
export function TabHeader({
  role,
  isActive,
  onClick,
}: {
  role: AgentRole;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      borderStyle="round"
      borderColor={isActive ? (role === 'worker' ? TONE.ok : TONE.brand) : FG.faint}
      paddingX={1}
    >
      <Text
        bold={isActive}
        color={isActive ? (role === 'worker' ? TONE.ok : TONE.brand) : FG.faint}
      >
        {role === 'worker' ? 'Worker' : 'Supervisor'}
      </Text>
    </Box>
  );
}
