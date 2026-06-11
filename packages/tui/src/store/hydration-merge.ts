import type { TimelineItem } from '../bridge.js';

/**
 * 判断 incoming 是否为空文本而 local 已有流式内容（应保留 local）。
 */
export function shouldKeepLocalTextPart(
  local: TimelineItem | undefined,
  incoming: TimelineItem,
): boolean {
  if (!local) return false;
  if (local.kind !== 'assistant_text' && local.kind !== 'reasoning') return false;
  if (incoming.kind !== local.kind) return false;
  return incoming.text.length === 0 && local.text.length > 0;
}

/**
 * 解析单条条目的 hydration 合并结果。
 */
export function resolveHydratedEntry(
  local: TimelineItem | undefined,
  incoming: TimelineItem,
  liveTouchedIds: ReadonlySet<string>,
): TimelineItem {
  if (local && liveTouchedIds.has(incoming.id)) {
    return cloneTimelineItem(local);
  }
  if (shouldKeepLocalTextPart(local, incoming)) {
    return cloneTimelineItem(local!);
  }
  return cloneTimelineItem(incoming);
}

/**
 * 将 hydration 拉取的 timeline 与本地 live 状态合并，避免陈旧空 part 覆盖流式内容。
 */
export function mergeTimelineEntries(
  local: TimelineItem[],
  incoming: TimelineItem[],
  liveTouchedIds: ReadonlySet<string>,
): TimelineItem[] {
  const localById = new Map(local.map(item => [item.id, item]));
  const merged: TimelineItem[] = [];
  const mergedIds = new Set<string>();

  for (const incomingItem of incoming) {
    const resolved = resolveHydratedEntry(localById.get(incomingItem.id), incomingItem, liveTouchedIds);
    merged.push(resolved);
    mergedIds.add(incomingItem.id);
  }

  for (const localItem of local) {
    if (mergedIds.has(localItem.id)) continue;
    if (!liveTouchedIds.has(localItem.id)) continue;
    merged.push(cloneTimelineItem(localItem));
    mergedIds.add(localItem.id);
  }

  return merged;
}

function cloneTimelineItem(item: TimelineItem): TimelineItem {
  switch (item.kind) {
    case 'message':
      return { ...item, message: { ...item.message } };
    case 'assistant_text':
    case 'reasoning':
      return { ...item, text: item.text };
    case 'tool':
      return { ...item, tool: { ...item.tool, args: { ...item.tool.args } } };
  }
}
