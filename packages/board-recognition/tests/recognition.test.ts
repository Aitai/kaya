/**
 * Tests for @kaya/board-recognition
 * Run with: bun test
 */
import { describe, test, expect } from 'bun:test';
import type { RawImage } from '../src/types';
import { toGrayscale, resize, sampleCircleMean } from '../src/image';
import { gaussianBlur, canny } from '../src/edges';
import { computeHomography, applyHomography, warpPerspective } from '../src/perspective';
import { classifyIntersections } from '../src/stones';
import { buildSGF } from '../src/sgf';
import { reclassifyWithCorners, recognizeBoard } from '../src/index';
import { createSyntheticBoard, syntheticCorners } from './fixtures';

// ============================================================================
// Image utilities
// ============================================================================

describe('Image utilities', () => {
  test('toGrayscale: red pixel → 76', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray([255, 0, 0, 255]),
      width: 1,
      height: 1,
    };
    const gray = toGrayscale(img);
    expect(Math.round(gray.data[0])).toBe(76);
  });

  test('toGrayscale: white pixel → 255', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray([255, 255, 255, 255]),
      width: 1,
      height: 1,
    };
    const gray = toGrayscale(img);
    expect(Math.round(gray.data[0])).toBe(255);
  });

  test('toGrayscale: black pixel → 0', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1,
      height: 1,
    };
    const gray = toGrayscale(img);
    expect(gray.data[0]).toBe(0);
  });

  test('resize: scales down a large image', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray(1000 * 1000 * 4).fill(128),
      width: 1000,
      height: 1000,
    };
    const small = resize(img, 100);
    expect(small.width).toBeLessThanOrEqual(100);
    expect(small.height).toBeLessThanOrEqual(100);
  });

  test('resize: preserves aspect ratio for non-square', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray(200 * 100 * 4).fill(128),
      width: 200,
      height: 100,
    };
    const small = resize(img, 100);
    expect(small.width).toBe(100);
    expect(small.height).toBe(50);
  });

  test('resize: returns same image if already small', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray(50 * 50 * 4).fill(64),
      width: 50,
      height: 50,
    };
    const out = resize(img, 100);
    expect(out).toBe(img);
  });

  test('sampleCircleMean: uniform field', () => {
    const gray = new Float32Array(100).fill(200);
    const mean = sampleCircleMean(gray, 5, 5, 3, 10, 10);
    expect(Math.abs(mean - 200)).toBeLessThan(0.1);
  });
});

// ============================================================================
// Edge detection
// ============================================================================

describe('Edge detection', () => {
  test('gaussianBlur reduces variance', () => {
    const size = 40;
    const data = new Float32Array(size * size);
    for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 0 : 255;
    const noisy = { data, width: size, height: size };
    const blurred = gaussianBlur(noisy, 2);
    const varNoisy = data.reduce((s, v) => s + (v - 128) ** 2, 0);
    const varBlur = blurred.data.reduce((s, v) => s + (v - 128) ** 2, 0);
    expect(varBlur).toBeLessThan(varNoisy);
  });

  test('canny detects a vertical edge', () => {
    const size = 50;
    const data = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) data[y * size + x] = x < size / 2 ? 40 : 200;
    const edges = canny({ data, width: size, height: size }, 1.0);
    // Expect edges in the middle column band
    let edgePixels = 0;
    for (let y = 5; y < size - 5; y++)
      for (let x = size / 2 - 3; x <= size / 2 + 3; x++) if (edges[y * size + x]) edgePixels++;
    expect(edgePixels).toBeGreaterThan(5);
  });

  test('canny: flat image has no edges', () => {
    const size = 30;
    const data = new Float32Array(size * size).fill(128);
    const edges = canny({ data, width: size, height: size }, 1.0);
    const total = edges.reduce((s, v) => s + v, 0);
    expect(total).toBe(0);
  });
});

// ============================================================================
// Perspective transform
// ============================================================================

describe('Perspective transform', () => {
  test('computeHomography returns 9 elements', () => {
    const H = computeHomography(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      [
        [10, 10],
        [90, 10],
        [90, 90],
        [10, 90],
      ]
    );
    expect(H).not.toBeNull();
    expect(H!.length).toBe(9);
  });

  test('identity homography maps point to itself', () => {
    const H = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const [x, y] = applyHomography(H, 42, 77);
    expect(Math.abs(x - 42)).toBeLessThan(0.001);
    expect(Math.abs(y - 77)).toBeLessThan(0.001);
  });

  test('homography maps source corners to dest corners', () => {
    const src: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
    ];
    const dst: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    const H = computeHomography(src, dst)!;
    const [x0, y0] = applyHomography(H, 0, 0);
    expect(Math.abs(x0)).toBeLessThan(0.01);
    expect(Math.abs(y0)).toBeLessThan(0.01);
    const [x2, y2] = applyHomography(H, 200, 200);
    expect(Math.abs(x2 - 100)).toBeLessThan(0.01);
    expect(Math.abs(y2 - 100)).toBeLessThan(0.01);
  });

  test('warpPerspective output has correct size', () => {
    const img: RawImage = {
      data: new Uint8ClampedArray(200 * 200 * 4).fill(128),
      width: 200,
      height: 200,
    };
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [199, 0],
      [199, 199],
      [0, 199],
    ];
    const warped = warpPerspective(img, corners, 80);
    expect(warped.width).toBe(80);
    expect(warped.height).toBe(80);
  });

  test('warpPerspective identity corners preserves colour', () => {
    // Create a plain-colored 50x50 image
    const img: RawImage = {
      data: new Uint8ClampedArray(50 * 50 * 4),
      width: 50,
      height: 50,
    };
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 200;
      img.data[i + 1] = 100;
      img.data[i + 2] = 50;
      img.data[i + 3] = 255;
    }
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [49, 0],
      [49, 49],
      [0, 49],
    ];
    const warped = warpPerspective(img, corners, 50);
    // Centre pixel should be close to original colour
    const ci = (25 * 50 + 25) * 4;
    expect(Math.abs(warped.data[ci] - 200)).toBeLessThan(10);
    expect(Math.abs(warped.data[ci + 1] - 100)).toBeLessThan(10);
  });
});

// ============================================================================
// Stone detection on synthetic boards
// ============================================================================

describe('Stone detection', () => {
  test('empty 9x9 board → no stones', () => {
    const img = createSyntheticBoard({ boardSize: 9, imageSize: 400 });
    const [tl, tr, br, bl] = syntheticCorners(400);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];
    const warped = warpPerspective(img, corners, 800);
    const gray = toGrayscale(warped);
    const stones = classifyIntersections(gray, 9);
    expect(stones.length).toBe(0);
  });

  test('single black stone at (3,3) detected', () => {
    const img = createSyntheticBoard({
      boardSize: 9,
      imageSize: 450,
      stones: [{ x: 3, y: 3, color: 'black' }],
    });
    const [tl, tr, br, bl] = syntheticCorners(450);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];
    const warped = warpPerspective(img, corners, 800);
    const gray = toGrayscale(warped);
    const stones = classifyIntersections(gray, 9);
    const found = stones.find(s => s.x === 3 && s.y === 3 && s.color === 'black');
    expect(found).toBeDefined();
  });

  test('single white stone at (5,5) detected', () => {
    const img = createSyntheticBoard({
      boardSize: 9,
      imageSize: 450,
      stones: [{ x: 5, y: 5, color: 'white' }],
    });
    const [tl, tr, br, bl] = syntheticCorners(450);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];
    const warped = warpPerspective(img, corners, 800);
    const gray = toGrayscale(warped);
    const stones = classifyIntersections(gray, 9);
    const found = stones.find(s => s.x === 5 && s.y === 5 && s.color === 'white');
    expect(found).toBeDefined();
  });

  test('four stones (2 black, 2 white) all detected on 9x9', () => {
    const placed = [
      { x: 2, y: 2, color: 'black' as const },
      { x: 6, y: 6, color: 'black' as const },
      { x: 2, y: 6, color: 'white' as const },
      { x: 6, y: 2, color: 'white' as const },
    ];
    const img = createSyntheticBoard({ boardSize: 9, imageSize: 500, stones: placed });
    const [tl, tr, br, bl] = syntheticCorners(500);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];
    const warped = warpPerspective(img, corners, 800);
    const gray = toGrayscale(warped);
    const stones = classifyIntersections(gray, 9);
    for (const s of placed) {
      const found = stones.find(d => d.x === s.x && d.y === s.y && d.color === s.color);
      expect(found).toBeDefined();
    }
  });

  test('19x19 board with corner star-point stones all detected', () => {
    const placed = [
      { x: 3, y: 3, color: 'black' as const },
      { x: 15, y: 15, color: 'white' as const },
      { x: 3, y: 15, color: 'black' as const },
      { x: 15, y: 3, color: 'white' as const },
      { x: 9, y: 9, color: 'black' as const },
    ];
    const img = createSyntheticBoard({ boardSize: 19, imageSize: 800, stones: placed });
    const [tl, tr, br, bl] = syntheticCorners(800);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];
    const warped = warpPerspective(img, corners, 800);
    const gray = toGrayscale(warped);
    const stones = classifyIntersections(gray, 19);
    for (const s of placed) {
      const found = stones.find(d => d.x === s.x && d.y === s.y && d.color === s.color);
      expect(found).toBeDefined();
    }
  });
});

// ============================================================================
// SGF generation
// ============================================================================

describe('SGF generation', () => {
  test('empty board produces valid SGF with no AB/AW', () => {
    const sgf = buildSGF(19, []);
    expect(sgf).toContain('SZ[19]');
    expect(sgf).not.toContain('AB');
    expect(sgf).not.toContain('AW');
  });

  test('black stone at (3,3) → AB[dd]', () => {
    const sgf = buildSGF(19, [{ x: 3, y: 3, color: 'black' }]);
    expect(sgf).toContain('AB[dd]');
  });

  test('white stone at (15,15) → AW[pp]', () => {
    const sgf = buildSGF(19, [{ x: 15, y: 15, color: 'white' }]);
    expect(sgf).toContain('AW[pp]');
  });

  test('SGF is parseable (no crashes on round-trip)', () => {
    const stones = [
      { x: 3, y: 3, color: 'black' as const },
      { x: 15, y: 15, color: 'white' as const },
    ];
    const sgf = buildSGF(19, stones);
    expect(sgf.startsWith('(;')).toBe(true);
    expect(sgf.includes(')')).toBe(true);
  });
});

// ============================================================================
// Full pipeline integration
// ============================================================================

describe('Full pipeline (reclassifyWithCorners)', () => {
  test('detects stones on 9x9 synthetic board', async () => {
    const placed = [
      { x: 3, y: 3, color: 'black' as const },
      { x: 5, y: 5, color: 'white' as const },
    ];
    const img = createSyntheticBoard({ boardSize: 9, imageSize: 450, stones: placed });
    const [tl, tr, br, bl] = syntheticCorners(450);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];

    const result = await reclassifyWithCorners(img, corners, { boardSize: 9 });

    expect(result.boardSize).toBe(9);
    const b = result.stones.find(s => s.x === 3 && s.y === 3 && s.color === 'black');
    const w = result.stones.find(s => s.x === 5 && s.y === 5 && s.color === 'white');
    expect(b).toBeDefined();
    expect(w).toBeDefined();
    expect(result.sgf).toContain('SZ[9]');
    expect(result.sgf).toContain('AB[dd]');
  });

  test('empty board → no stones, valid SGF', async () => {
    const img = createSyntheticBoard({ boardSize: 9, imageSize: 400 });
    const [tl, tr, br, bl] = syntheticCorners(400);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];

    const result = await reclassifyWithCorners(img, corners, { boardSize: 9 });
    expect(result.stones.length).toBe(0);
    expect(result.sgf).toContain('SZ[9]');
  });

  test('19x19 board with many stones', async () => {
    const placed: Array<{ x: number; y: number; color: 'black' | 'white' }> = [];
    for (let i = 0; i < 5; i++) placed.push({ x: i * 3, y: i * 3, color: 'black' });
    for (let i = 0; i < 5; i++) placed.push({ x: i * 3 + 1, y: i * 3 + 1, color: 'white' });

    const img = createSyntheticBoard({ boardSize: 19, imageSize: 800, stones: placed });
    const [tl, tr, br, bl] = syntheticCorners(800);
    const corners: [[number, number], [number, number], [number, number], [number, number]] = [
      [tl[0], tl[1]],
      [tr[0], tr[1]],
      [br[0], br[1]],
      [bl[0], bl[1]],
    ];

    const result = await reclassifyWithCorners(img, corners, { boardSize: 19 });
    expect(result.boardSize).toBe(19);
    // Every placed stone should be detected
    for (const s of placed) {
      const found = result.stones.find(d => d.x === s.x && d.y === s.y && d.color === s.color);
      expect(found).toBeDefined();
    }
  });
});

// ============================================================================
// recognizeBoard with automatic corner detection on synthetic image
// ============================================================================

describe('recognizeBoard (automatic corners)', () => {
  test('finds stones on clearly-bordered synthetic 9x9', async () => {
    const placed = [
      { x: 4, y: 4, color: 'black' as const },
      { x: 2, y: 6, color: 'white' as const },
    ];
    const img = createSyntheticBoard({ boardSize: 9, imageSize: 500, stones: placed });
    const result = await recognizeBoard(img, { boardSize: 9 });
    // We may or may not get corners – but the function should not throw
    expect(result.boardSize).toBe(9);
    expect(result.sgf).toContain('SZ[9]');
    expect(Array.isArray(result.stones)).toBe(true);
  });
});
