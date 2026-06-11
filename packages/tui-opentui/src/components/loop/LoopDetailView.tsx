/**
 * Loop 详情页
 *
 * 展示内容（按方案 5.3）：
 * - 当前 phase 和 attempt
 * - 最近 phase 转换历史
 * - runtime signal（no-progress、verification-failed 等）
 * - checkpoint 状态
 */

import React from "react";
import { DetailView } from "../common/DetailView.js";
import { colors } from "../../theme/colors.js";
import type { TuiState } from "../../store/types.js";

export interface LoopDetailViewProps {
  loopState: TuiState["loop"];
  onClose: () => void;
}

export const LoopDetailView: React.FC<LoopDetailViewProps> = ({ loopState, onClose }) => {
  return (
    <DetailView
      title="Loop State Detail"
      onClose={onClose}
      footer={
        <text color={colors.fg.muted}>按 Esc 返回</text>
      }
    >
      <text bold color={colors.fg.primary}>当前 Phase: {loopState.phase}</text>
      <text color={colors.fg.secondary}>Attempt: {loopState.attempt}</text>

      {loopState.lastTransition && (
        <text color={colors.fg.muted}>
          上次转换: {loopState.lastTransition.from} → {loopState.lastTransition.to}
        </text>
      )}

      <text color={colors.fg.muted} style={{ marginTop: 1 }}>
        （TaskLedger、checkpoint、signal 详情待完善）
      </text>
    </DetailView>
  );
};