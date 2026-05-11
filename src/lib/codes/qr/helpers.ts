/**
 * QR structural helpers — alignment patterns, reserved-module map, zig-zag
 * read order, mask formulas. Ported from legacy/codes/qr/qr-helpers.js.
 */

// ---- Easing & math ----

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const hexToRgbNorm = (
  hex: string,
): { r: number; g: number; b: number } => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

// ---- QR structure ----

const ALIGNMENT_TABLE: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
  [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
  [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

export function getAlignmentPositions(version: number): number[] {
  if (version === 1) return [];
  return ALIGNMENT_TABLE[version - 1] ?? [];
}

export function buildReservedMap(size: number, version: number): Uint8Array[] {
  const reserved: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );

  // Finder + separator squares (top-left, top-right, bottom-left)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r < size && c < size) reserved[r][c] = 1;
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = size - 8; c < size; c++) {
      if (r < size && c >= 0) reserved[r][c] = 1;
    }
  }
  for (let r = size - 8; r < size; r++) {
    for (let c = 0; c < 9; c++) {
      if (r >= 0 && c < size) reserved[r][c] = 1;
    }
  }

  // Timing strips
  for (let i = 0; i < size; i++) {
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }

  // Alignment patterns
  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    for (const r of positions) {
      for (const c of positions) {
        if (r < 9 && c < 9) continue;
        if (r < 9 && c > size - 9) continue;
        if (r > size - 9 && c < 9) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < size && cc >= 0 && cc < size) {
              reserved[rr][cc] = 1;
            }
          }
        }
      }
    }
  }

  // Format info strip
  for (let i = 0; i < 9; i++) {
    if (i < size) reserved[8][i] = 1;
    if (i < size) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (size - 1 - i >= 0) reserved[size - 1 - i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (size - 8 + i < size) reserved[8][size - 8 + i] = 1;
  }

  // Dark module
  if (4 * version + 9 < size) reserved[4 * version + 9][8] = 1;

  // Version info blocks (v7+)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = 1;
        reserved[size - 11 + j][i] = 1;
      }
    }
  }

  return reserved;
}

export function computeZigZagOrder(
  size: number,
  version: number,
): [number, number][] {
  const reserved = buildReservedMap(size, version);
  const order: [number, number][] = [];
  let col = size - 1;
  let upward = true;

  while (col >= 0) {
    if (col === 6) {
      col--;
      continue;
    }
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      if (!reserved[row][col]) order.push([row, col]);
      if (col - 1 >= 0 && !reserved[row][col - 1]) order.push([row, col - 1]);
    }
    upward = !upward;
    col -= 2;
  }
  return order;
}

export function evaluateMaskFormula(
  maskPattern: number,
  row: number,
  col: number,
): number {
  let condition = false;
  switch (maskPattern) {
    case 0: condition = (row + col) % 2 === 0; break;
    case 1: condition = row % 2 === 0; break;
    case 2: condition = col % 3 === 0; break;
    case 3: condition = (row + col) % 3 === 0; break;
    case 4: condition = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
    case 5: condition = ((row * col) % 2) + ((row * col) % 3) === 0; break;
    case 6: condition = (((row * col) % 2) + ((row * col) % 3)) % 2 === 0; break;
    case 7: condition = (((row + col) % 2) + ((row * col) % 3)) % 2 === 0; break;
  }
  return condition ? 1 : 0;
}

export function generateMaskGrid(
  size: number,
  maskPattern: number,
): Uint8Array[] {
  const mask: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      mask[row][col] = evaluateMaskFormula(maskPattern, row, col);
    }
  }
  return mask;
}

export const MASK_FORMULAS: readonly string[] = [
  '(row + col) mod 2 = 0',
  'row mod 2 = 0',
  'col mod 3 = 0',
  '(row + col) mod 3 = 0',
  '(row/2 + col/3) mod 2 = 0',
  '(row*col) mod 2 + (row*col) mod 3 = 0',
  '((row*col) mod 2 + (row*col) mod 3) mod 2 = 0',
  '((row+col) mod 2 + (row*col) mod 3) mod 2 = 0',
];
