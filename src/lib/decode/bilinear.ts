export interface Point {
  x: number;
  y: number;
}

/**
 * Bilinear interpolation across the 4 corners of a (possibly skewed) quad,
 * returning the pixel coordinate at normalized position (u, v) in [0..1].
 */
export function bilinear(
  tl: Point,
  tr: Point,
  bl: Point,
  br: Point,
  u: number,
  v: number,
): Point {
  const x =
    (1 - u) * (1 - v) * tl.x +
    u * (1 - v) * tr.x +
    (1 - u) * v * bl.x +
    u * v * br.x;
  const y =
    (1 - u) * (1 - v) * tl.y +
    u * (1 - v) * tr.y +
    (1 - u) * v * bl.y +
    u * v * br.y;
  return { x, y };
}

/** Average brightness across a small square area around (px, py), clamped to bounds. */
export function sampleBrightnessArea(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  px: number,
  py: number,
  radius: number,
): number {
  let total = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = Math.max(0, Math.min(w - 1, Math.round(px + dx)));
      const cy = Math.max(0, Math.min(h - 1, Math.round(py + dy)));
      const idx = (cy * w + cx) * 4;
      total += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count++;
    }
  }
  return total / count;
}
