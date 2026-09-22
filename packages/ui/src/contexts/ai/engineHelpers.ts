import type { AutoPick, BackendId } from '@kaya/ai-engine';
import type { ModelQuantization } from '../../hooks/game/ai-analysis-types';
import type { AISettings } from '../../types/game';
import type { EngineStatus } from './engineStatus';
import { settingToChainBackend } from './backendVocabulary';

/** User-friendly backend display names for toasts. */
export function backendDisplayName(backend: string): string {
  switch (backend) {
    case 'webgpu':
    case 'webgpu-gc':
      return 'GPU';
    case 'native':
      return 'Native GPU';
    case 'native-cpu':
      return 'Native CPU';
    case 'pytorch':
      return 'PyTorch GPU';
    case 'wasm':
      return 'CPU';
    case 'webnn':
      return 'WebNN';
    default:
      return backend.toUpperCase();
  }
}

/**
 * Precision names for the mismatch toast — interpolated into an already
 * translated sentence, so it must be locale-neutral.
 */
export { QUANT_DISPLAY_NAMES as QUANT_LABELS } from '../../hooks/game/ai-analysis-types';

/**
 * Decide which backend chain to use:
 *  - settings.backend === 'auto' → full auto-pick (preferred default)
 *  - explicit setting → start from that backend, fall through the rest
 */
export function resolveBackendChain(settings: AISettings, autoPick: AutoPick): BackendId[] {
  // The settings vocabulary is not the chain vocabulary — `settingToChainBackend`
  // is the only place that translation happens, and it returns null (rather
  // than passing the value through) for anything it cannot translate.
  const preferred = settingToChainBackend(settings.backend);
  if (!preferred) {
    return autoPick.backendChain;
  }
  // Start from the explicit backend, then fall through the auto chain (de-duped).
  return [preferred, ...autoPick.backendChain.filter(b => b !== preferred)];
}

/** Quantization label inferred from a model name (best effort). */
export function quantFromModelName(name: string): ModelQuantization {
  if (/\.fp16\.|-fp16/i.test(name)) return 'fp16';
  if (/\.uint8\.|-quant/i.test(name)) return 'uint8';
  return 'fp32';
}

/**
 * Module reloads lose auto-pick reasoning, so rebuild a minimal ready
 * status. The provider re-derives full reasoning on its next initialize()
 * call, which happens on first settings change.
 */
export function buildReadyStatus(): EngineStatus {
  return { phase: 'ready', backend: 'unknown', quantization: 'fp32', reasoning: '' };
}
