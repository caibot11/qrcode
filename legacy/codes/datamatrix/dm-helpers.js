// Data Matrix structure math and helpers
import { easeOutCubic, lerp, hexToRgbNorm } from '../qr/qr-helpers.js';
export { easeOutCubic, lerp, hexToRgbNorm };

export const DM_STAGE_INFO = [
  {
    title: 'L-Shape Finder',
    description: 'The solid black border on the bottom and left edges helps the scanner locate and orient the Data Matrix.',
    detail: 'Unlike QR codes with three corner finders, Data Matrix uses an L-shaped solid border along two edges. The scanner looks for this continuous dark border to find the code and determine its rotation.'
  },
  {
    title: 'Clock Track',
    description: 'Alternating modules along the top and right edges establish the grid spacing.',
    detail: 'The clock track (alternating black-white pattern) runs along the edges opposite the L-finder. It tells the scanner exactly how many rows and columns the code has, even if the image is slightly distorted.'
  },
  {
    title: 'Data Region',
    description: 'Data is read in a diagonal path through the interior grid, filling modules in a specific pattern.',
    detail: 'Data Matrix reads data by placing codewords diagonally across the data region. Each 8-bit codeword is distributed across the grid in a specific diagonal pattern that maximizes error resilience.'
  },
  {
    title: 'Error Correction',
    description: 'Reed-Solomon error correction protects the data. Data Matrix can recover from significant damage.',
    detail: 'Data Matrix uses Reed-Solomon error correction similar to QR codes. The data and error correction codewords are interleaved across the symbol for maximum resilience.'
  },
  {
    title: 'Final Decode',
    description: 'Each codeword resolves to a character. Watch the message emerge from the grid!',
    detail: 'After error correction verification, each data codeword is converted to its ASCII character. The characters are assembled in order to reveal the encoded message.'
  }
];

export const DM_STAGE_COLORS = ['#6bcb77', '#ffd93d', '#9b59b6', '#ff6b6b', '#1abc9c'];
export const DM_STAGE_DURATIONS = [8000, 8000, 14000, 8000, 15000];

// Module categories for Data Matrix
export const DM_CAT_LFINDER = 0;   // L-shape finder (bottom + left solid)
export const DM_CAT_CLOCK = 1;     // Clock track (top + right alternating)
export const DM_CAT_DATA = 2;      // Data region

/**
 * Categorize a 16x16 Data Matrix grid's modules
 */
export function categorizeDMModules(size) {
  const categories = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let cat;
      // Bottom row (r = size-1) = solid bar
      // Left column (c = 0) = solid bar
      if (r === size - 1 || c === 0) {
        cat = DM_CAT_LFINDER;
      }
      // Top row (r = 0) = clock track (alternating)
      // Right column (c = size-1) = clock track (alternating)
      else if (r === 0 || c === size - 1) {
        cat = DM_CAT_CLOCK;
      }
      // Interior = data
      else {
        cat = DM_CAT_DATA;
      }
      categories.push({ row: r, col: c, cat });
    }
  }
  return categories;
}

/**
 * Generate diagonal reading order for Data Matrix interior data region
 * Simplified diagonal sweep for visualization purposes
 */
export function computeDMDiagonalOrder(size) {
  const order = [];
  // Read interior (1..size-2, 1..size-2) in diagonal sweeps
  const interior = size - 2;
  for (let diag = 0; diag < interior * 2 - 1; diag++) {
    const startR = diag < interior ? 0 : diag - interior + 1;
    const endR = Math.min(diag, interior - 1);
    if (diag % 2 === 0) {
      // Up-right
      for (let r = endR; r >= startR; r--) {
        const c = diag - r;
        order.push([r + 1, c + 1]); // +1 for border offset
      }
    } else {
      // Down-left
      for (let r = startR; r <= endR; r++) {
        const c = diag - r;
        order.push([r + 1, c + 1]);
      }
    }
  }
  return order;
}
