import type { DmVizData } from '@/lib/codes/types';

/**
 * Synthetic 16×16 Data Matrix encoding "HELLO" — solid L-finder + alternating
 * clock track + deterministic LFSR data fill so the visualization looks real.
 * Ported from legacy/codes/datamatrix/dm-demo.js.
 */
export const DEMO_DM: DmVizData = buildDemoDm();

function buildDemoDm(): DmVizData {
  const size = 16;
  const grid: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );

  // L-shape finder: bottom row + left column = all dark.
  for (let c = 0; c < size; c++) grid[size - 1][c] = 1;
  for (let r = 0; r < size; r++) grid[r][0] = 1;

  // Clock track: top row + right column = alternating.
  for (let c = 0; c < size; c++) grid[0][c] = c % 2 === 0 ? 1 : 0;
  for (let r = 0; r < size; r++) grid[r][size - 1] = r % 2 === 0 ? 1 : 0;

  // Interior: deterministic Galois-LFSR fill.
  let state = 0xbeef;
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      state = ((state >> 1) ^ (-(state & 1) & 0xb400)) & 0xffff;
      grid[r][c] = state & 1;
    }
  }

  return {
    kind: 'datamatrix',
    gridSize: size,
    moduleGrid: grid,
    decodedText: 'HELLO',
    version: 1,
  };
}
