import { bilinear, sampleBrightnessArea, type Point } from './bilinear';
import { otsuThreshold } from './otsu';

export interface QrLocation {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomLeftCorner: Point;
  bottomRightCorner?: Point;
}

/**
 * Extract a binarized QR module grid from a raw camera frame.
 * Ported from legacy/app.js `extractModuleGrid`.
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
  const { topLeftCorner, topRightCorner, bottomLeftCorner } = location;
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;

  // jsQR sometimes omits bottomRightCorner; reconstruct via parallelogram.
  const bottomRightCorner: Point = location.bottomRightCorner ?? {
    x: topRightCorner.x + bottomLeftCorner.x - topLeftCorner.x,
    y: topRightCorner.y + bottomLeftCorner.y - topLeftCorner.y,
  };

  // Compute module size in pixels to determine sampling radius.
  const modulePxW =
    Math.hypot(
      topRightCorner.x - topLeftCorner.x,
      topRightCorner.y - topLeftCorner.y,
    ) / size;
  const modulePxH =
    Math.hypot(
      bottomLeftCorner.x - topLeftCorner.x,
      bottomLeftCorner.y - topLeftCorner.y,
    ) / size;
  const modulePx = Math.min(modulePxW, modulePxH);
  const sampleR = Math.max(1, Math.floor(modulePx * 0.25));

  // First pass: collect per-module average brightness.
  const brightness = new Float64Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const u = (col + 0.5) / size;
      const v = (row + 0.5) / size;
      const p = bilinear(
        topLeftCorner,
        topRightCorner,
        bottomLeftCorner,
        bottomRightCorner,
        u,
        v,
      );
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
