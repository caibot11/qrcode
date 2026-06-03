import type { QrFormatInfo } from '@/lib/codes/types';

const FORMAT_BIT_POSITIONS: [number, number][] = [
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [8, 7], [8, 8],
  [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
];

const EC_LABELS: Record<number, QrFormatInfo['errorCorrectionLevel']> = {
  1: 'L',
  0: 'M',
  3: 'Q',
  2: 'H',
};

/**
 * Read the 15 format bits from the top-left corner area of a QR grid,
 * XOR with the QR format mask (0x5412), and split into EC level + mask pattern.
 * Ported from legacy/app.js `readFormatInfo`.
 */
export function readFormatInfo(grid: Uint8Array[]): QrFormatInfo {
  let formatBits = 0;
  for (let i = 0; i < 15; i++) {
    const [row, col] = FORMAT_BIT_POSITIONS[i];
    if (grid[row]?.[col]) {
      formatBits |= 1 << (14 - i);
    }
  }
  formatBits ^= 0x5412;

  const ecLevel = (formatBits >> 13) & 0x03;
  const maskPattern = (formatBits >> 10) & 0x07;

  return {
    raw: formatBits,
    errorCorrectionLevel: EC_LABELS[ecLevel] ?? 'M',
    maskPattern,
    ecLevel,
    formatBitPositions: FORMAT_BIT_POSITIONS,
  };
}

/**
 * Write the 15 format-information bits (both copies) into a QR grid for a given
 * error-correction level (2-bit value) and mask pattern. Inverse of
 * readFormatInfo — BCH(15,5) with generator 0x537, XOR'd with the QR mask
 * 0x5412. Used when re-masking a re-encoded grid to a different mask.
 */
export function writeFormatInfo(
  grid: Uint8Array[],
  ecBits: number,
  maskPattern: number,
): void {
  const size = grid.length;
  const data = (ecBits << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => (bits >> i) & 1;

  // Copy 1 — around the top-left finder.
  for (let i = 0; i < 6; i++) grid[i][8] = bit(i);
  grid[7][8] = bit(6);
  grid[8][8] = bit(7);
  grid[8][7] = bit(8);
  for (let i = 9; i < 15; i++) grid[8][14 - i] = bit(i);

  // Copy 2 — bits 0-7 along row 8 (top-right), bits 8-14 down col 8 (bottom-left).
  for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = bit(i);
}

export { FORMAT_BIT_POSITIONS };
