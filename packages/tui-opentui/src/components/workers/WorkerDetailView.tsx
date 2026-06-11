/**
 * Worker 详情页
 *
 * 展示内容（按方案 5.1）：
 * - Worker ID、模型 target、profile、harness
 * - 当前动作与最近工具
 * - TaskLedger 摘要
 * - 权限/Question 阻塞状态
 * - SupervisorAdvice 采纳情况
 *
 * 样式说明：使用 DetailView 框架，状态颜色来自 theme/colors.task
 */

import React from "react";
import { DetailView } from "../common/DetailView.js";
import { colors } from "../../theme/colors.js";
import type { WorkerSnapshot } from "../../store/types.js";

export interface WorkerDetailViewProps {
  worker: WorkerSnapshot;
  onClose: () => void;
}

export const WorkerDetailView: React.FC<WorkerDetailViewProps> = ({ worker, onClose }) => {
  return (
    <DetailView
      title={`Worker · ${worker.modelTarget}`}
      onClose={onClose}
      footer={
        <text color={colors.fg.muted}>按 Esc 返回 | Enter 执行操作（待实现）</text>
      }
    >
      <text color={colors.fg.primary}>ID: {worker.id}</text>
      <text color={colors.task[worker.status] ?? colors.fg.primary}>
        状态: {worker.status}
      </text>
      <text color={colors.fg.secondary}>当前任务: {worker.currentTask ?? "—"}</text>
      <text color={colors.fg.muted}>耗时: {(worker.elapsedMs / 1000).toFixed(1)}s</text>

      {/* TODO: 接入真实 TaskLedger、工具历史、验证结果、SupervisorAdvice */}
      <text color={colors.fg.muted} style={{ marginTop: 1 }}>
        （详情内容待 TUI-OT-60 真实事件接入后完善）
      </text>
    </DetailView>
  );
};