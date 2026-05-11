// Aztec code structure math and helpers
import { easeOutCubic, lerp, hexToRgbNorm } from '../qr/qr-helpers.js';
export { easeOutCubic, lerp, hexToRgbNorm };

export const AZTEC_STAGE_INFO = [
  {
    title: 'Bullseye Finder',
    description: 'Concentric square rings at the center rise from innermost to outermost, like a target.',
    detail: 'The bullseye is the Aztec code\'s unique finder pattern. A compact Aztec code has a 5×5 center with alternating black-white rings. The scanner detects this distinctive target pattern to locate the code — no corner finders needed.'
  },
  {
    title: 'Mode Message',
    description: 'The ring around the bullseye encodes layer count and data word length.',
    detail: 'The mode message is a 28-bit or 40-bit ring just outside the bullseye. It tells the scanner how many data layers the code has and how many codewords are encoded. This information is essential for proper decoding.'
  },
  {
    title: 'Data Layers',
    description: 'Data layers radiate outward from the center. A cursor spirals through each layer reading modules.',
    detail: 'Aztec codes store data in concentric square layers around the bullseye. Each layer is 2 modules thick. Data is read in a clockwise spiral pattern, starting from the innermost layer and moving outward.'
  },
  {
    title: 'Error Correction',
    description: 'Reed-Solomon error correction protects the data, similar to QR codes.',
    detail: 'Aztec codes use Reed-Solomon error correction with configurable levels (5% to 95% of symbol capacity). The code can recover from damage proportional to the EC level chosen during encoding.'
  },
  {
    title: 'Final Decode',
    description: 'Each codeword is converted to a character. The message appears letter by letter!',
    detail: 'After error correction verification, each data codeword is interpreted according to the encoding mode (upper, lower, mixed, punctuation, digit, or binary). Characters are assembled to form the decoded text.'
  }
];

export const AZTEC_STAGE_COLORS = ['#9b59b6', '#ff6b6b', '#4d96ff', '#6bcb77', '#1abc9c'];
export const AZTEC_STAGE_DURATIONS = [10000, 8000, 14000, 8000, 15000];

// Module categories
export const AZ_CAT_BULLSEYE = 0;
export const AZ_CAT_MODE = 1;
export const AZ_CAT_DATA = 2;

/**
 * Determine which ring (0 = center, 1 = first ring, etc.) a module belongs to
 * For a compact Aztec code (15×15), center is at (7,7)
 */
export function getBullseyeRing(row, col, center) {
  const dr = Math.abs(row - center);
  const dc = Math.abs(col - center);
  const dist = Math.max(dr, dc); // Chebyshev distance
  return dist;
}

/**
 * Categorize modules in a compact Aztec code
 * Bullseye: rings 0-2 (center 5×5 core)
 * Mode message: ring 3
 * Data: rings 4+
 */
export function categorizeAztecModules(size) {
  const center = Math.floor(size / 2);
  const categories = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ring = getBullseyeRing(r, c, center);
      let cat;

      if (ring <= 2) {
        cat = AZ_CAT_BULLSEYE;
      } else if (ring === 3) {
        cat = AZ_CAT_MODE;
      } else {
        cat = AZ_CAT_DATA;
      }

      categories.push({ row: r, col: c, cat, ring });
    }
  }
  return categories;
}

/**
 * Compute spiral reading order for data layers
 * Starting from innermost data layer, spiraling outward clockwise
 */
export function computeAztecSpiralOrder(size) {
  const center = Math.floor(size / 2);
  const order = [];

  // For each data layer (ring 4 and outward)
  const maxRing = Math.floor(size / 2);
  for (let ring = 4; ring <= maxRing; ring++) {
    // Top edge: left to right
    const top = center - ring;
    const bottom = center + ring;
    const left = center - ring;
    const right = center + ring;

    // Top row
    for (let c = left; c <= right; c++) {
      if (top >= 0 && top < size && c >= 0 && c < size) {
        order.push([top, c]);
      }
    }
    // Right column
    for (let r = top + 1; r <= bottom; r++) {
      if (r >= 0 && r < size && right >= 0 && right < size) {
        order.push([r, right]);
      }
    }
    // Bottom row (right to left)
    for (let c = right - 1; c >= left; c--) {
      if (bottom >= 0 && bottom < size && c >= 0 && c < size) {
        order.push([bottom, c]);
      }
    }
    // Left column (bottom to top)
    for (let r = bottom - 1; r > top; r--) {
      if (r >= 0 && r < size && left >= 0 && left < size) {
        order.push([r, left]);
      }
    }
  }

  return order;
}
