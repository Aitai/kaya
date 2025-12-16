/**
 * Clipboard utility that works in both browser and Tauri environments.
 * In Tauri, uses the clipboard-manager plugin to avoid permission popups.
 * Falls back to navigator.clipboard API for web browsers.
 */

import { isTauriApp } from './fileSave';

/**
 * Read text from the clipboard.
 * Uses Tauri's clipboard plugin in desktop app to avoid permission popups.
 */
export async function readClipboardText(): Promise<string> {
  if (isTauriApp()) {
    try {
      // Dynamically import Tauri clipboard plugin
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      const text = await readText();
      return text ?? '';
    } catch (error) {
      console.warn('Tauri clipboard read failed, falling back to browser API:', error);
      // Fall through to browser API
    }
  }

  // Browser API fallback
  return navigator.clipboard.readText();
}

/**
 * Write text to the clipboard.
 * Uses Tauri's clipboard plugin in desktop app for consistency.
 */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriApp()) {
    try {
      // Dynamically import Tauri clipboard plugin
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return;
    } catch (error) {
      console.warn('Tauri clipboard write failed, falling back to browser API:', error);
      // Fall through to browser API
    }
  }

  // Browser API fallback
  await navigator.clipboard.writeText(text);
}
