/**
 * Closes an overlay when the user presses the system back gesture.
 *
 * On Android, Tauri maps the hardware back button to `webview.goBack()` and
 * finishes the activity when the webview has nothing to go back to. Kaya is a
 * single-page app that never touches history, so the first back press quit the
 * app even with a dialog open (tauri-apps/tauri#8142). Giving the webview one
 * history entry while an overlay is open turns the gesture into a `popstate`,
 * which this module routes to the topmost overlay's close handler.
 *
 * Design notes:
 * - One shared sentinel entry, not one per overlay. Nested overlays extend the
 *   same entry, and it is re-pushed after each back press if overlays remain.
 * - `selfPops` marks the `history.back()` calls we make ourselves when an
 *   overlay is dismissed from the UI, so the resulting `popstate` is not
 *   mistaken for a user back press.
 * - The `popstate` listener is installed once and never removed: the removals
 *   are what would race with a pending self-pop (and thus desynchronise the
 *   counter), and an empty stack simply means the next back press exits — the
 *   native behaviour we want.
 * - Effects run twice under `StrictMode`; the sentinel flag plus `selfPops`
 *   make the mount/unmount/remount cycle a no-op instead of closing the
 *   overlay that just opened.
 */

import { useEffect, useRef } from 'react';

type CloseHandler = () => void;

const stack: CloseHandler[] = [];
let sentinelActive = false;
let selfPops = 0;
let listening = false;

function markSentinel(): void {
  if (sentinelActive) return;
  sentinelActive = true;
  window.history.pushState({ ...window.history.state, kayaOverlay: true }, '');
}

function handlePopState(): void {
  if (selfPops > 0) {
    selfPops -= 1;
    return;
  }

  // The user consumed our sentinel.
  sentinelActive = false;
  stack.pop()?.();

  // Overlays are still open, so keep one entry for the next back press.
  if (stack.length > 0) markSentinel();
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  window.addEventListener('popstate', handlePopState);
  listening = true;
}

/**
 * @param isOpen Whether the overlay is currently shown. Pass `true` for
 *   overlays that are conditionally *mounted* by their parent instead.
 * @param onClose Called when the user presses back while this overlay is the
 *   topmost one. Read through a ref, so it does not need to be stable.
 */
export function useCloseOnBack(isOpen: boolean, onClose: CloseHandler): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    startListening();

    const handler: CloseHandler = () => closeRef.current();
    stack.push(handler);
    markSentinel();

    return () => {
      const index = stack.lastIndexOf(handler);
      if (index >= 0) stack.splice(index, 1);

      // Dismissed from the UI: take our sentinel back off the history stack.
      if (stack.length === 0 && sentinelActive) {
        sentinelActive = false;
        selfPops += 1;
        window.history.back();
      }
    };
  }, [isOpen]);
}
