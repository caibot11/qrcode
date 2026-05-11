// Hardcoded 16x16 Data Matrix demo encoding "HELLO"
export const DEMO_DM = buildDemoDM();

function buildDemoDM() {
  const size = 16;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));

  // L-shape finder: bottom row = all black, left column = all black
  for (let c = 0; c < size; c++) grid[size - 1][c] = 1;
  for (let r = 0; r < size; r++) grid[r][0] = 1;

  // Clock track: top row = alternating, right column = alternating
  for (let c = 0; c < size; c++) grid[0][c] = c % 2 === 0 ? 1 : 0;
  for (let r = 0; r < size; r++) grid[r][size - 1] = r % 2 === 0 ? 1 : 0;

  // Fill data region with deterministic LFSR pattern for realistic look
  let state = 0xBEEF;
  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      state = ((state >> 1) ^ (-(state & 1) & 0xB400)) & 0xFFFF;
      grid[r][c] = state & 1;
    }
  }

  return {
    gridSize: size,
    moduleGrid: grid,
    decodedText: 'HELLO',
    version: 1
  };
}
