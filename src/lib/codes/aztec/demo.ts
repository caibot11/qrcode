import type { AztecVizData } from '@/lib/codes/types';

/**
 * Synthetic 15×15 compact Aztec code encoding "HELLO". Bullseye is built
 * from concentric alternating rings; mode message is a deterministic
 * pattern; data layers are LFSR-filled.
 * Ported from legacy/codes/aztec/aztec-demo.js.
 */
export const DEMO_AZTEC: AztecVizData = buildDemoAztec();

function buildDemoAztec(): AztecVizData {
  const size = 15;
  const center = 7;
  const grid: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );

  // Bullseye + mode + data rings
  let state = 0xcafe;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ring = Math.max(Math.abs(r - center), Math.abs(c - center));
      if (ring <= 2) {
        // Concentric alternating rings.
        grid[r][c] = ring % 2 === 0 ? 1 : 0;
      } else if (ring === 3) {
        // Mode message — deterministic pattern.
        grid[r][c] = (r + c) % 3 === 0 ? 1 : 0;
      } else {
        // Data layers — LFSR.
        state = ((state >> 1) ^ (-(state & 1) & 0xb400)) & 0xffff;
        grid[r][c] = state & 1;
      }
    }
  }

  return {
    kind: 'aztec',
    gridSize: size,
    moduleGrid: grid,
    decodedText: 'HELLO',
    version: 1,
  };
}
