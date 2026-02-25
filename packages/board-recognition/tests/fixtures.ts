/**
 * Synthetic board image generation for tests.
 * All functions work in pure TypeScript with no browser APIs.
 */

import type { RawImage } from '../src/types';

export interface SyntheticBoardOptions {
  boardSize: 9 | 13 | 19;
  imageSize: number;
  /** Margin as fraction of imageSize on each side (default 0.1) */
  margin?: number;
  stones?: Array<{ x: number; y: number; color: 'black' | 'white' }>;
}

/**
 * Create a synthetic top-down Go board image as a RawImage (RGBA).
 * The board fills the middle (1 - 2*margin) of the image.
 * Grid intersections are at regular intervals inside the board region.
 */
export function createSyntheticBoard(opts: SyntheticBoardOptions): RawImage {
  const { boardSize, imageSize, margin = 0.1, stones = [] } = opts;

  const data = new Uint8ClampedArray(imageSize * imageSize * 4);

  // Board colour (light wood)
  const BOARD_R = 205,
    BOARD_G = 175,
    BOARD_B = 105;
  // Line colour (dark)
  const LINE_R = 55,
    LINE_G = 38,
    LINE_B = 18;
  // Background (slightly different to board for realism)
  const BG_R = 160,
    BG_G = 140,
    BG_B = 100;

  // Fill background
  for (let i = 0; i < data.length; i += 4) {
    data[i] = BG_R;
    data[i + 1] = BG_G;
    data[i + 2] = BG_B;
    data[i + 3] = 255;
  }

  const boardPx = Math.round(imageSize * (1 - 2 * margin));
  const boardStartX = Math.round(imageSize * margin);
  const boardStartY = Math.round(imageSize * margin);
  const boardEndX = boardStartX + boardPx;
  const boardEndY = boardStartY + boardPx;

  // Fill board area
  for (let y = boardStartY; y < boardEndY; y++) {
    for (let x = boardStartX; x < boardEndX; x++) {
      const i = (y * imageSize + x) * 4;
      data[i] = BOARD_R;
      data[i + 1] = BOARD_G;
      data[i + 2] = BOARD_B;
      data[i + 3] = 255;
    }
  }

  const cellSize = boardPx / (boardSize - 1);
  const lineW = Math.max(1, Math.round(cellSize * 0.04));
  const stoneR = Math.round(cellSize * 0.42);

  // Draw grid lines
  for (let i = 0; i < boardSize; i++) {
    const pos = Math.round(boardStartX + i * cellSize);

    // Horizontal line
    for (let x = boardStartX; x <= boardEndX; x++) {
      for (let w = -lineW; w <= lineW; w++) {
        const y = pos + w;
        if (y >= 0 && y < imageSize) {
          const idx = (y * imageSize + x) * 4;
          data[idx] = LINE_R;
          data[idx + 1] = LINE_G;
          data[idx + 2] = LINE_B;
          data[idx + 3] = 255;
        }
      }
    }
    // Vertical line
    for (let y = boardStartY; y <= boardEndY; y++) {
      for (let w = -lineW; w <= lineW; w++) {
        const x = pos + w;
        if (x >= 0 && x < imageSize) {
          const idx = (y * imageSize + x) * 4;
          data[idx] = LINE_R;
          data[idx + 1] = LINE_G;
          data[idx + 2] = LINE_B;
          data[idx + 3] = 255;
        }
      }
    }
  }

  // Draw stones
  for (const stone of stones) {
    const cx = Math.round(boardStartX + stone.x * cellSize);
    const cy = Math.round(boardStartY + stone.y * cellSize);

    const r = stone.color === 'black' ? 20 : 235;
    const g = stone.color === 'black' ? 20 : 235;
    const b = stone.color === 'black' ? 20 : 235;

    for (let dy = -stoneR; dy <= stoneR; dy++) {
      for (let dx = -stoneR; dx <= stoneR; dx++) {
        if (dx * dx + dy * dy <= stoneR * stoneR) {
          const px = cx + dx,
            py = cy + dy;
          if (px >= 0 && px < imageSize && py >= 0 && py < imageSize) {
            const idx = (py * imageSize + px) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }
    }
  }

  return { data, width: imageSize, height: imageSize };
}

/** Compute exact grid corner positions for a synthetic board image */
export function syntheticCorners(
  imageSize: number,
  margin = 0.1
): [[number, number], [number, number], [number, number], [number, number]] {
  const boardPx = Math.round(imageSize * (1 - 2 * margin));
  const start = Math.round(imageSize * margin);
  const end = start + boardPx;
  return [
    [start, start], // TL
    [end, start], // TR
    [end, end], // BR
    [start, end], // BL
  ];
}
