import {
  applyMat3,
  quadToQuad,
  sampleBrightnessArea,
  type Point,
} from './bilinear';
import { otsuThreshold } from './otsu';

export interface QrLocation {
  /** Centre of each finder pattern (≈ module 3.5 in from the corner). */
  topLeftFinderPattern: Point;
  topRightFinderPattern: Point;
  bottomLeftFinderPattern: Point;
  /** Centre of the bottom-right alignment pattern, when present (version ≥ 2). */
  bottomRightAlignmentPattern?: Point;
}

/**
 * Extract a binarized QR module grid from a raw camera frame.
 *
 * The sampling grid is anchored to the three finder-pattern centres plus the
 * bottom-right alignment pattern — the same control points a real QR decoder
 * uses. A code on a flat surface projects to the camera as a homography, so a
 * single projective transform through these points samples every module at its
 * true centre, even for high-version codes where mapping from only the outer
 * corners would drift. (jsQR already located these points to decode the text.)
 *
 * @returns grid indexed [row][col]; 1 = dark module, 0 = light
 */
export function extractModuleGrid(
  imageData: ImageData,
  location: QrLocation,
  version: number,
): Uint8Array[] {
  const size = 4 * version + 17;
  const grid: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;

  const tlF = location.topLeftFinderPattern;
  const trF = location.topRightFinderPattern;
  const blF = location.bottomLeftFinderPattern;
  const align = location.bottomRightAlignmentPattern;
  const hasAlign = !!align;

  // Control points in module space (finder centres at 3.5; alignment at 6.5
  // in from the bottom-right) → their measured positions in the image.
  const src: Point[] = [
    { x: 3.5, y: 3.5 },
    { x: size - 3.5, y: 3.5 },
    hasAlign ? { x: size - 6.5, y: size - 6.5 } : { x: size - 3.5, y: size - 3.5 },
    { x: 3.5, y: size - 3.5 },
  ];
  const dst: Point[] = [
    tlF,
    trF,
    hasAlign
      ? (align as Point)
      : {
          // version 1 (no alignment): extrapolate the 4th corner.
          x: trF.x + blF.x - tlF.x,
          y: trF.y + blF.y - tlF.y,
        },
    blF,
  ];
  const xf = quadToQuad(src, dst);

  // Module size in pixels (finder centres are size-7 modules apart) → sample radius.
  // Average over most of each module (≈0.8× its width) so phone-screen moiré and
  // anti-aliased edges don't flip near-threshold modules.
  const modulePx = Math.hypot(trF.x - tlF.x, trF.y - tlF.y) / (size - 7);
  const sampleR = Math.max(1, Math.floor(modulePx * 0.4));

  // First pass: collect per-module average brightness at each module centre.
  const brightness = new Float64Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const p = applyMat3(xf, col + 0.5, row + 0.5);
      brightness[row * size + col] = sampleBrightnessArea(
        data,
        w,
        h,
        p.x,
        p.y,
        sampleR,
      );
    }
  }

  // Second pass: apply Otsu threshold.
  const threshold = otsuThreshold(brightness);
  for (let i = 0; i < brightness.length; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    grid[row][col] = brightness[i] < threshold ? 1 : 0;
  }

  return grid;
}
