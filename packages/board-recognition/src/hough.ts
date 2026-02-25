// ============================================================================
// Hough line transform
// ============================================================================

const DEG = Math.PI / 180;

export interface HoughPeak {
  thetaIdx: number; // index into theta bins
  rhoIdx: number; // index into rho bins
  votes: number;
  theta: number; // angle in radians
  rho: number; // distance in pixels (image-centred)
}

/**
 * Run Hough transform on a binary edge image.
 * Uses image-centred coordinate system so rho is symmetric around 0.
 * theta range: 0 .. 179 degrees (1 degree steps)
 */
export function houghTransform(
  edges: Uint8Array,
  width: number,
  height: number,
  thetaStepDeg = 1
): { accumulator: Int32Array; numTheta: number; numRho: number; D: number } {
  const D = Math.sqrt(width * width + height * height);
  const numRho = Math.ceil(2 * D) + 2;
  const numTheta = Math.round(180 / thetaStepDeg);

  // Precompute trig
  const cosT = new Float64Array(numTheta);
  const sinT = new Float64Array(numTheta);
  for (let t = 0; t < numTheta; t++) {
    const theta = t * thetaStepDeg * DEG;
    cosT[t] = Math.cos(theta);
    sinT[t] = Math.sin(theta);
  }

  const accumulator = new Int32Array(numTheta * numRho);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    const py = y - cy;
    for (let x = 0; x < width; x++) {
      if (!edges[y * width + x]) continue;
      const px = x - cx;
      for (let t = 0; t < numTheta; t++) {
        const rho = px * cosT[t] + py * sinT[t];
        const rhoIdx = Math.round(rho + D);
        if (rhoIdx >= 0 && rhoIdx < numRho) {
          accumulator[t * numRho + rhoIdx]++;
        }
      }
    }
  }

  return { accumulator, numTheta, numRho, D };
}

/**
 * Find the top N peaks in the Hough accumulator using non-max suppression
 * in a neighbourhood of (minDistTheta degrees, minDistRho pixels).
 */
export function findHoughPeaks(
  accumulator: Int32Array,
  numTheta: number,
  numRho: number,
  D: number,
  topN = 100,
  minDistTheta = 8, // degrees
  minDistRho = 15 // pixels
): HoughPeak[] {
  const suppressed = new Uint8Array(numTheta * numRho);
  const peaks: HoughPeak[] = [];

  // Build sorted index list
  const indices = Array.from({ length: numTheta * numRho }, (_, i) => i);
  indices.sort((a, b) => accumulator[b] - accumulator[a]);

  for (const idx of indices) {
    if (peaks.length >= topN) break;
    if (suppressed[idx] || accumulator[idx] <= 0) continue;

    const t = Math.floor(idx / numRho);
    const r = idx % numRho;
    const theta = t * DEG;
    const rho = r - D;

    peaks.push({ thetaIdx: t, rhoIdx: r, votes: accumulator[idx], theta, rho });

    // Suppress neighbourhood
    for (let dt = -minDistTheta; dt <= minDistTheta; dt++) {
      for (let dr = -minDistRho; dr <= minDistRho; dr++) {
        const nt = (((t + dt) % numTheta) + numTheta) % numTheta;
        const nr = r + dr;
        if (nr >= 0 && nr < numRho) suppressed[nt * numRho + nr] = 1;
      }
    }
  }

  return peaks;
}

/**
 * Intersect two Hough lines.
 * Coordinates are image-centred (origin at centre of image).
 * Returns null if lines are parallel.
 */
export function intersectLines(
  theta1: number,
  rho1: number,
  theta2: number,
  rho2: number
): [number, number] | null {
  const c1 = Math.cos(theta1),
    s1 = Math.sin(theta1);
  const c2 = Math.cos(theta2),
    s2 = Math.sin(theta2);
  const det = c1 * s2 - c2 * s1;
  if (Math.abs(det) < 1e-10) return null;
  return [(rho1 * s2 - rho2 * s1) / det, (rho2 * c1 - rho1 * c2) / det];
}
