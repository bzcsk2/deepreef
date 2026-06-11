/**
 * Supervisor 详情页
 *
 * 展示内容（按方案 5.2）：
 * - 候选 model target 和 provider
 * - 当前审查的 Worker、失败签名
 * - SupervisorAdvice 结构化字段
 * - Worker 采纳情况与净进展
 */

import React from "react";
import { DetailView } from "../common/DetailView.js";
import { colors } from "../../theme/colors.js";
import type { SupervisorSnapshot } from "../../store/types.js";

export interface SupervisorDetailViewProps {
  supervisor: SupervisorSnapshot;
  onClose: () => void;
}

export const SupervisorDetailView: React.FC<SupervisorDetailViewProps> = ({ supervisor, onClose }) => {
  return (
    <DetailView
      title={`Supervisor · ${supervisor.modelTarget}`}
      onClose={onClose}
      footer={
        <text color={colors.fg.muted}>按 Esc 返回</text>
      }
    >
      <text color={colors.fg.primary}>ID: {supervisor.id}</text>
      <text color={colors.status[supervisor.status] ?? colors.fg.primary}>
        状态: {supervisor.status}
      </text>
      {supervisor.reviewingWorkerId && (
        <text color={colors.fg.secondary}>正在审查: {supervisor.reviewingWorkerId}</text>
      )}
      {supervisor.cooldownRemainingMs != null && (
        <text color={colors.status.warning}>冷却剩余: {supervisor.cooldownRemainingMs}ms</text>
      )}

      <text color={colors.fg.muted} style={{ marginTop: 1 }}>
        （Advice 详情待真实事件接入后完善）
      </text>
    </DetailView>
  );
};