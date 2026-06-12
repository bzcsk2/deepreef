import { useCallback } from 'react';
import { useInput } from '@deepreef/ink';
import type { ScrollBoxHandle } from '@deepreef/ink';
import type React from 'react';

/**
 * 绑定消息区 ScrollBox 的键盘滚动。
 * PageUp/PageDown、Ctrl+方向键、Home/End。
 * 鼠标滚轮已禁用。
 * PageDown 到达底部时自动调用 scrollToBottom() 恢复 stickyScroll 跟随。
 */
export function useMessageScroll(
  scrollRef: React.RefObject<ScrollBoxHandle | null>,
  isActive: boolean,
): void {
  const scrollByPage = useCallback((direction: -1 | 1) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const viewport = scroll.getViewportHeight?.() ?? 12;
    scroll.scrollBy(Math.round(direction * Math.max(1, viewport * 0.85)));
  }, [scrollRef]);

  useInput((_input, key) => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    if (key.pageUp || (key.ctrl && key.upArrow)) {
      scrollByPage(-1);
      return;
    }
    if (key.pageDown || (key.ctrl && key.downArrow)) {
      // PageDown: if already near bottom (within half viewport), re-engage sticky
      const viewport = scroll.getViewportHeight?.() ?? 12;
      const scrollTop = scroll.getScrollTop?.() ?? 0;
      const scrollHeight = scroll.getScrollHeight?.() ?? 0;
      const maxScroll = Math.max(0, scrollHeight - viewport);
      if (maxScroll - scrollTop <= viewport) {
        scroll.scrollToBottom();
      } else {
        scrollByPage(1);
      }
      return;
    }
    if (key.home) {
      scroll.scrollTo(0);
      return;
    }
    if (key.end) {
      scroll.scrollToBottom();
    }
  }, { isActive });
}
