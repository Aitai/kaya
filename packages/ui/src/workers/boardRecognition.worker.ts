/**
 * Web Worker for board recognition – keeps heavy image processing off the
 * main thread so corner-dragging and the rest of the UI stay responsive.
 */
import {
  recognizeBoard,
  reclassifyWithCorners,
  reclassifyWithHints,
} from '@kaya/board-recognition';
import type {
  RawImage,
  BoardCorners,
  CalibrationHint,
  RecognitionOptions,
  RecognitionResult,
} from '@kaya/board-recognition';

// ── Message protocol ────────────────────────────────────────────────────────

export type WorkerRequest =
  | {
      type: 'recognizeBoard';
      id: number;
      imgBuffer: ArrayBuffer;
      width: number;
      height: number;
      options: RecognitionOptions;
    }
  | {
      type: 'reclassifyWithCorners';
      id: number;
      imgBuffer: ArrayBuffer;
      width: number;
      height: number;
      corners: BoardCorners;
      options: RecognitionOptions;
    }
  | {
      type: 'reclassifyWithHints';
      id: number;
      imgBuffer: ArrayBuffer;
      width: number;
      height: number;
      corners: BoardCorners;
      hints: CalibrationHint[];
      options: RecognitionOptions;
    };

export interface WorkerResponse {
  id: number;
  result?: SerializedResult;
  error?: string;
}

/** Serializable version of RecognitionResult (warpedImage sent as buffer). */
export interface SerializedResult {
  boardSize: number;
  stones: RecognitionResult['stones'];
  corners: BoardCorners;
  cornersDetected: boolean;
  sgf: string;
  warpedBuffer: ArrayBuffer;
  warpedSize: number; // width === height
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toRawImage(buffer: ArrayBuffer, width: number, height: number): RawImage {
  return { data: new Uint8ClampedArray(buffer), width, height };
}

function serializeResult(r: RecognitionResult): {
  serialized: SerializedResult;
  transfer: ArrayBuffer[];
} {
  const warpedBuffer = r.warpedImage.data.buffer as ArrayBuffer;
  return {
    serialized: {
      boardSize: r.boardSize,
      stones: r.stones,
      corners: r.corners,
      cornersDetected: r.cornersDetected,
      sgf: r.sgf,
      warpedBuffer,
      warpedSize: r.warpedImage.width,
    },
    transfer: [warpedBuffer],
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    let result: RecognitionResult;

    switch (msg.type) {
      case 'recognizeBoard': {
        const img = toRawImage(msg.imgBuffer, msg.width, msg.height);
        result = await recognizeBoard(img, msg.options);
        break;
      }
      case 'reclassifyWithCorners': {
        const img = toRawImage(msg.imgBuffer, msg.width, msg.height);
        result = await reclassifyWithCorners(img, msg.corners, msg.options);
        break;
      }
      case 'reclassifyWithHints': {
        const img = toRawImage(msg.imgBuffer, msg.width, msg.height);
        result = await reclassifyWithHints(img, msg.corners, msg.hints, msg.options);
        break;
      }
      default:
        return;
    }

    const { serialized, transfer } = serializeResult(result);
    (self as unknown as Worker).postMessage(
      { id: msg.id, result: serialized } satisfies WorkerResponse,
      transfer
    );
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
