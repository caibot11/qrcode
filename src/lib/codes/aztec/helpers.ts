/**
 * Aztec code helpers — bullseye ring detection + spiral data read order.
 * Ported from legacy/codes/aztec/aztec-helpers.js.
 */

export const AztecCat = {
  /** Bullseye finder (concentric center, rings 0..2) */
  Bullseye: 0,
  /** Mode message (ring 3) */
  Mode: 1,
  /** Data layers (rings 4+) */
  Data: 2,
} as const;
export type AztecCat = (typeof AztecCat)[keyof typeof AztecCat];

export interface AztecCategoryInfo {
  row: number;
  col: number;
  cat: AztecCat;
  /** Chebyshev distance from center (0 = center pixel) */
  ring: number;
}

export function getBullseyeRing(
  row: number,
  col: number,
  center: number,
): number {
  return Math.max(Math.abs(row - center), Math.abs(col - center));
}

export function categorizeAztecModules(size: number): AztecCategoryInfo[] {
  const center = Math.floor(size / 2);
  const out: AztecCategoryInfo[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ring = getBullseyeRing(r, c, center);
      let cat: AztecCat;
      if (ring <= 2) cat = AztecCat.Bullseye;
      else if (ring === 3) cat = AztecCat.Mode;
      else cat = AztecCat.Data;
      out.push({ row: r, col: c, cat, ring });
    }
  }
  return out;
}

/**
 * Clockwise spiral read order through data layers (rings 4+),
 * starting from the innermost data ring and moving outward.
 */
export function computeAztecSpiralOrder(size: number): [number, number][] {
  const center = Math.floor(size / 2);
  const order: [number, number][] = [];
  const maxRing = Math.floor(size / 2);

  for (let ring = 4; ring <= maxRing; ring++) {
    const top = center - ring;
    const bottom = center + ring;
    const left = center - ring;
    const right = center + ring;

    for (let c = left; c <= right; c++) {
      if (top >= 0 && top < size && c >= 0 && c < size) order.push([top, c]);
    }
    for (let r = top + 1; r <= bottom; r++) {
      if (r >= 0 && r < size && right >= 0 && right < size) order.push([r, right]);
    }
    for (let c = right - 1; c >= left; c--) {
      if (bottom >= 0 && bottom < size && c >= 0 && c < size) order.push([bottom, c]);
    }
    for (let r = bottom - 1; r > top; r--) {
      if (r >= 0 && r < size && left >= 0 && left < size) order.push([r, left]);
    }
  }
  return order;
}
