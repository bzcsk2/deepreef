import React, { type PropsWithChildren, useContext, useInsertionEffect } from 'react';
import instances from '../core/instances.js';
import {
  DISABLE_MOUSE_TRACKING,
  ENABLE_MOUSE_TRACKING,
  ENABLE_WHEEL_ONLY_TRACKING,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
} from '../core/termio/dec.js';
import { TerminalWriteContext } from '../hooks/useTerminalNotification.js';
import Box from './Box.js';
import { TerminalSizeContext } from './TerminalSizeContext.js';

type Props = PropsWithChildren<{
  /**
   * Mouse tracking mode. Default true (full: wheel + click + drag).
   * - true / false: full SGR tracking (wheel + click/drag) or none.
   * - 'wheel': wheel + basic click only, does NOT hijack the terminal's
   *   native text-selection drag (omits DEC 1002/1003). Best default for
   *   apps that only need scroll-wheel support.
   */
  mouseTracking?: boolean | 'wheel';
}>;

/**
 * Run children in the terminal's alternate screen buffer, constrained to
 * the viewport height. While mounted:
 *
 * - Enters the alt screen (DEC 1049), clears it, homes the cursor
 * - Constrains its own height to the terminal row count, so overflow must
 *   be handled via `overflow: scroll` / flexbox (no native scrollback)
 * - Optionally enables SGR mouse tracking (wheel + click/drag) — events
 *   surface as `ParsedKey` (wheel) and update the Ink instance's
 *   selection state (click/drag)
 *
 * On unmount, disables mouse tracking and exits the alt screen, restoring
 * the main screen's content. Safe for use in ctrl-o transcript overlays
 * and similar temporary fullscreen views — the main screen is preserved.
 *
 * Notifies the Ink instance via `setAltScreenActive()` so the renderer
 * keeps the cursor inside the viewport (preventing the cursor-restore LF
 * from scrolling content) and so signal-exit cleanup can exit the alt
 * screen if the component's own unmount doesn't run.
 */
export function AlternateScreen({ children, mouseTracking = true }: Props): React.ReactNode {
  const size = useContext(TerminalSizeContext);
  const writeRaw = useContext(TerminalWriteContext);
  const trackingSeq = mouseTracking === 'wheel'
    ? ENABLE_WHEEL_ONLY_TRACKING
    : mouseTracking
      ? ENABLE_MOUSE_TRACKING
      : '';

  // useInsertionEffect (not useLayoutEffect): react-reconciler calls
  // resetAfterCommit between the mutation and layout commit phases, and
  // Ink's resetAfterCommit triggers onRender. With useLayoutEffect, that
  // first onRender fires BEFORE this effect — writing a full frame to the
  // main screen with altScreen=false. That frame is preserved when we
  // enter alt screen and revealed on exit as a broken view. Insertion
  // effects fire during the mutation phase, before resetAfterCommit, so
  // ENTER_ALT_SCREEN reaches the terminal before the first frame does.
  // Cleanup timing is unchanged: both insertion and layout effect cleanup
  // run in the mutation phase on unmount, before resetAfterCommit.
  useInsertionEffect(() => {
    const ink = instances.get(process.stdout);
    if (!writeRaw) return;

    writeRaw(ENTER_ALT_SCREEN + '\x1b[2J\x1b[H' + trackingSeq);
    // Tell the Ink instance about alt-screen activation. For 'wheel' mode
    // we pass false so ink.tsx's re-assert paths don't fire full tracking
    // (we've already sent the wheel-only sequence ourselves); the trade-off
    // is that a terminal reconnect (tmux detach/attach) won't re-enable
    // wheel tracking automatically.
    ink?.setAltScreenActive(true, mouseTracking === true);

    return () => {
      ink?.setAltScreenActive(false);
      ink?.clearTextSelection();
      writeRaw((trackingSeq ? DISABLE_MOUSE_TRACKING : '') + EXIT_ALT_SCREEN);
    };
  }, [writeRaw, trackingSeq, mouseTracking]);

  return (
    <Box flexDirection="column" height={size?.rows ?? 24} width="100%" flexShrink={0}>
      {children}
    </Box>
  );
}
