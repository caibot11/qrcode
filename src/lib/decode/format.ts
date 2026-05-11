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

export { FORMAT_BIT_POSITIONS };
