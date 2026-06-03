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

/** Coefficients of a unit-square → quadrilateral projective (perspective) map. */
export interface PerspectiveCoeffs {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/**
 * Build the perspective transform mapping the unit-square corners
 * (0,0)→tl, (1,0)→tr, (1,1)→br, (0,1)→bl.
 *
 * A code on a flat surface (paper, phone screen) projects into the camera as a
 * homography, so this is the correct sampling model — plain bilinear is only
 * exact for an affine (non-tilted) view and smears the interior under
 * perspective. Closed form per Heckbert, "Fundamentals of Texture Mapping and
 * Image Warping".
 */
export function squareToQuad(
  tl: Point,
  tr: Point,
  br: Point,
  bl: Point,
): PerspectiveCoeffs {
  const dx1 = tr.x - br.x;
  const dx2 = bl.x - br.x;
  const sx = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y;
  const dy2 = bl.y - br.y;
  const sy = tl.y - tr.y + br.y - bl.y;

  const den = dx1 * dy2 - dy1 * dx2;
  if (den === 0) {
    // Degenerate quad — fall back to an affine map.
    return {
      a: tr.x - tl.x, b: bl.x - tl.x, c: tl.x,
      d: tr.y - tl.y, e: bl.y - tl.y, f: tl.y,
      g: 0, h: 0,
    };
  }

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return {
    a: tr.x - tl.x + g * tr.x,
    b: bl.x - tl.x + h * bl.x,
    c: tl.x,
    d: tr.y - tl.y + g * tr.y,
    e: bl.y - tl.y + h * bl.y,
    f: tl.y,
    g,
    h,
  };
}

/** Map a unit-square coordinate (u, v in [0..1]) to a pixel via the transform. */
export function applyPerspective(
  t: PerspectiveCoeffs,
  u: number,
  v: number,
): Point {
  const w = t.g * u + t.h * v + 1;
  return {
    x: (t.a * u + t.b * v + t.c) / w,
    y: (t.d * u + t.e * v + t.f) / w,
  };
}

/** Row-major 3×3 matrix. */
export type Mat3 = number[];

function coeffsToMat3(c: PerspectiveCoeffs): Mat3 {
  return [c.a, c.b, c.c, c.d, c.e, c.f, c.g, c.h, 1];
}

function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, I / det];
}

function multiply3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

/**
 * Build the general projective transform mapping the 4 source points (in order
 * TL, TR, BR, BL) to the 4 destination points in the same order. Used to map a
 * code's module space onto the captured image via its finder/alignment points.
 */
export function quadToQuad(src: Point[], dst: Point[]): Mat3 {
  const s = coeffsToMat3(squareToQuad(src[0], src[1], src[2], src[3]));
  const d = coeffsToMat3(squareToQuad(dst[0], dst[1], dst[2], dst[3]));
  return multiply3(d, invert3(s));
}

/** Apply a 3×3 projective transform to a point. */
export function applyMat3(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
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
