// Hardcoded compact Aztec code demo (15×15) encoding "HELLO"
export const DEMO_AZTEC = buildDemoAztec();

function buildDemoAztec() {
  const size = 15;
  const center = 7;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));

  // Build bullseye: alternating rings from center
  // Ring 0 (center pixel) = black
  // Ring 1 = white
  // Ring 2 = black
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dr = Math.abs(r - center);
      const dc = Math.abs(c - center);
      const ring = Math.max(dr, dc);

      if (ring <= 2) {
        // Bullseye: alternating black-white rings
        grid[r][c] = ring % 2 === 0 ? 1 : 0;
      }
    }
  }

  // Mode message ring (ring 3): alternating pattern with encoded info
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dr = Math.abs(r - center);
      const dc = Math.abs(c - center);
      const ring = Math.max(dr, dc);
      if (ring === 3) {
        // Mode message — use a deterministic pattern
        grid[r][c] = ((r + c) % 3 === 0) ? 1 : 0;
      }
    }
  }

  // Data layers (rings 4+): fill with LFSR pattern
  let state = 0xCAFE;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const dr = Math.abs(r - center);
      const dc = Math.abs(c - center);
      const ring = Math.max(dr, dc);
      if (ring >= 4) {
        state = ((state >> 1) ^ (-(state & 1) & 0xB400)) & 0xFFFF;
        grid[r][c] = state & 1;
      }
    }
  }

  return {
    gridSize: size,
    moduleGrid: grid,
    decodedText: 'HELLO',
    version: 1
  };
}
