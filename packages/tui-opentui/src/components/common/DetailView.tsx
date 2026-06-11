/**
 * 通用详情页框架
 *
 * 设计原则：
 * - 提供一致的标题栏、内容区、底部操作区
 * - 所有详情页复用此框架，便于主题统一调整
 * - 支持 Esc 关闭（通过 ActionRegistry）
 *
 * 中文注释：后续手动调整详情页宽度、边距时，只需修改此处的 layout token 即可全局生效
 */

import React from "react";
import { colors } from "../../theme/colors.js";
import { layout } from "../../theme/layout.js";

export interface DetailViewProps {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const DetailView: React.FC<DetailViewProps> = ({ title, children, footer }) => {
  return (
    <box
      style={{
        flexDirection: "column",
        borderStyle: "single",
        borderColor: colors.border.focus,
        backgroundColor: colors.bg.secondary,
        padding: layout.padding.content,
        flex: 1,
      }}
    >
      {/* 标题栏 */}
      <box style={{ borderBottom: true, borderColor: colors.border.normal, paddingBottom: 1 }}>
        <text bold color={colors.fg.primary}>{title}</text>
      </box>

      {/* 内容区 */}
      <box style={{ flex: 1, paddingTop: 1 }}>
        {children}
      </box>

      {/* 底部操作区 */}
      {footer && (
        <box style={{ borderTop: true, borderColor: colors.border.normal, paddingTop: 1 }}>
          {footer}
        </box>
      )}
    </box>
  );
};