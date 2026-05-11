/**
 * Data Matrix structure helpers — module categorization + diagonal read order.
 * Ported from legacy/codes/datamatrix/dm-helpers.js.
 */

export const DmCat = {
  /** L-shaped finder (solid bottom row + solid left column) */
  LFinder: 0,
  /** Clock track (alternating top row + right column) */
  Clock: 1,
  /** Interior data region */
  Data: 2,
} as const;
export type DmCat = (typeof DmCat)[keyof typeof DmCat];

export interface DmCategoryInfo {
  row: number;
  col: number;
  cat: DmCat;
}

export function categorizeDmModules(size: number): DmCategoryInfo[] {
  const out: DmCategoryInfo[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let cat: DmCat;
      if (r === size - 1 || c === 0) {
        cat = DmCat.LFinder;
      } else if (r === 0 || c === size - 1) {
        cat = DmCat.Clock;
      } else {
        cat = DmCat.Data;
      }
      out.push({ row: r, col: c, cat });
    }
  }
  return out;
}

/**
 * Diagonal sweep order across the interior (1..size-2). Simplified for the
 * visualization — alternates up-right and down-left along anti-diagonals.
 */
export function computeDmDiagonalOrder(size: number): [number, number][] {
  const order: [number, number][] = [];
  const interior = size - 2;
  for (let diag = 0; diag < interior * 2 - 1; diag++) {
    const startR = diag < interior ? 0 : diag - interior + 1;
    const endR = Math.min(diag, interior - 1);
    if (diag % 2 === 0) {
      for (let r = endR; r >= startR; r--) {
        const c = diag - r;
        order.push([r + 1, c + 1]);
      }
    } else {
      for (let r = startR; r <= endR; r++) {
        const c = diag - r;
        order.push([r + 1, c + 1]);
      }
    }
  }
  return order;
}
