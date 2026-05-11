import type { QrVizData } from '@/lib/codes/types';

/**
 * Synthetic Version-2 QR code for "HELLO WORLD" — 25×25 grid with proper
 * finder patterns, timing strips, alignment marker, dark module, and 15
 * format bits encoding EC level M + mask pattern 0. Data area filled with
 * deterministic pseudo-random bits so the visualization looks real.
 *
 * Ported from legacy/codes/qr/qr-demo.js.
 */
export const DEMO_QR: QrVizData = buildDemoQR();

function buildDemoQR(): QrVizData {
  const size = 25;
  const version = 2;
  const grid: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );

  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, size - 7);
  placeFinder(grid, size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0;
    grid[i][6] = i % 2 === 0 ? 1 : 0;
  }

  placeAlignment(grid, 18, 18);
  grid[17][8] = 1; // dark module for v2

  const fmtBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  const fmtPos1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];

  const fmtPos2: [number, number][] = [
    [24, 8], [23, 8], [22, 8], [21, 8], [20, 8], [19, 8], [18, 8],
    [8, 17], [8, 18], [8, 19], [8, 20], [8, 21], [8, 22], [8, 23], [8, 24],
  ];

  for (let i = 0; i < 15; i++) {
    grid[fmtPos1[i][0]][fmtPos1[i][1]] = fmtBits[i];
    grid[fmtPos2[i][0]][fmtPos2[i][1]] = fmtBits[i];
  }

  const reserved = buildReservedMapSimple(size);
  // Deterministic Galois-LFSR fill so the demo looks like real data without
  // shipping a real Reed-Solomon encoder.
  let state = 0xace1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) {
        state = ((state >> 1) ^ (-(state & 1) & 0xb400)) & 0xffff;
        grid[r][c] = state & 1;
      }
    }
  }

  return {
    kind: 'qr',
    version,
    gridSize: size,
    moduleGrid: grid,
    formatInfo: {
      raw: 0,
      errorCorrectionLevel: 'M',
      maskPattern: 0,
      ecLevel: 0,
      formatBitPositions: fmtPos1,
    },
    decodedText: 'HELLO WORLD',
    chunks: [],
    binaryData: [],
  };
}

function placeFinder(grid: Uint8Array[], startR: number, startC: number): void {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const outer = r === 0 || r === 6 || c === 0 || c === 6;
      const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[startR + r][startC + c] = outer || inner ? 1 : 0;
    }
  }
}

function placeAlignment(
  grid: Uint8Array[],
  centerR: number,
  centerC: number,
): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const outer = Math.abs(dr) === 2 || Math.abs(dc) === 2;
      const center = dr === 0 && dc === 0;
      grid[centerR + dr][centerC + dc] = outer || center ? 1 : 0;
    }
  }
}

function buildReservedMapSimple(size: number): Uint8Array[] {
  const r: Uint8Array[] = Array.from(
    { length: size },
    () => new Uint8Array(size),
  );

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) r[i][j] = 1;
    for (let j = size - 8; j < size; j++) r[i][j] = 1;
  }
  for (let i = size - 8; i < size; i++) {
    for (let j = 0; j < 9; j++) r[i][j] = 1;
  }

  for (let i = 0; i < size; i++) {
    r[6][i] = 1;
    r[i][6] = 1;
  }

  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      r[18 + dr][18 + dc] = 1;
    }
  }

  for (let i = 0; i < 9; i++) {
    r[8][i] = 1;
    r[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    r[size - 1 - i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    r[8][size - 8 + i] = 1;
  }

  r[17][8] = 1;

  return r;
}
