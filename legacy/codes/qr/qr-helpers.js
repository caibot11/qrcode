// ---- Easing & Math ----

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function hexToRgbNorm(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255
  };
}

// ---- QR Structure Helpers ----

export function getAlignmentPositions(version) {
  if (version === 1) return [];
  const table = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
    [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];
  return table[version - 1] || [];
}

export function buildReservedMap(size, version) {
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r < size && c < size) reserved[r][c] = 1;
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = size - 8; c < size; c++) {
      if (r < size && c >= 0) reserved[r][c] = 1;
    }
  }
  for (let r = size - 8; r < size; r++) {
    for (let c = 0; c < 9; c++) {
      if (r >= 0 && c < size) reserved[r][c] = 1;
    }
  }

  for (let i = 0; i < size; i++) {
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }

  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    for (const r of positions) {
      for (const c of positions) {
        if (r < 9 && c < 9) continue;
        if (r < 9 && c > size - 9) continue;
        if (r > size - 9 && c < 9) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (r + dr >= 0 && r + dr < size && c + dc >= 0 && c + dc < size) {
              reserved[r + dr][c + dc] = 1;
            }
          }
        }
      }
    }
  }

  for (let i = 0; i < 9; i++) {
    if (i < size) reserved[8][i] = 1;
    if (i < size) reserved[i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (size - 1 - i >= 0) reserved[size - 1 - i][8] = 1;
  }
  for (let i = 0; i < 8; i++) {
    if (size - 8 + i < size) reserved[8][size - 8 + i] = 1;
  }

  if (4 * version + 9 < size) reserved[4 * version + 9][8] = 1;

  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = 1;
        reserved[size - 11 + j][i] = 1;
      }
    }
  }

  return reserved;
}

export function computeZigZagOrder(size, version) {
  const reserved = buildReservedMap(size, version);
  const order = [];
  let col = size - 1;
  let upward = true;

  while (col >= 0) {
    if (col === 6) { col--; continue; }
    for (let i = 0; i < size; i++) {
      const row = upward ? (size - 1 - i) : i;
      if (!reserved[row][col]) order.push([row, col]);
      if (col - 1 >= 0 && !reserved[row][col - 1]) order.push([row, col - 1]);
    }
    upward = !upward;
    col -= 2;
  }
  return order;
}

export function generateMaskGrid(size, maskPattern) {
  const mask = Array.from({ length: size }, () => new Uint8Array(size));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      mask[row][col] = evaluateMaskFormula(maskPattern, row, col);
    }
  }
  return mask;
}

export function evaluateMaskFormula(maskPattern, row, col) {
  let condition = false;
  switch (maskPattern) {
    case 0: condition = (row + col) % 2 === 0; break;
    case 1: condition = row % 2 === 0; break;
    case 2: condition = col % 3 === 0; break;
    case 3: condition = (row + col) % 3 === 0; break;
    case 4: condition = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
    case 5: condition = ((row * col) % 2) + ((row * col) % 3) === 0; break;
    case 6: condition = (((row * col) % 2) + ((row * col) % 3)) % 2 === 0; break;
    case 7: condition = (((row + col) % 2) + ((row * col) % 3)) % 2 === 0; break;
  }
  return condition ? 1 : 0;
}

export const MASK_FORMULAS = [
  '(row + col) mod 2 = 0',
  'row mod 2 = 0',
  'col mod 3 = 0',
  '(row + col) mod 3 = 0',
  '(row/2 + col/3) mod 2 = 0',
  '(row*col) mod 2 + (row*col) mod 3 = 0',
  '((row*col) mod 2 + (row*col) mod 3) mod 2 = 0',
  '((row+col) mod 2 + (row*col) mod 3) mod 2 = 0'
];

// ---- 5 Stage Definitions ----

export const STAGE_INFO = [
  {
    title: 'Structure',
    description: 'Every QR code has finder patterns in three corners, timing strips between them, and alignment markers. These help scanners locate and orient the code from any angle.',
    detail: 'The three large squares (finder patterns) let a scanner instantly determine the QR code\'s position and rotation. Timing strips run between them to establish the module grid spacing. Alignment markers help correct for perspective distortion.'
  },
  {
    title: 'Format & Mask',
    description: 'Format bits encode the error correction level and mask pattern. The mask is then peeled off to reveal the true data underneath.',
    detail: 'The 15 format bits are XORed with the mask 0x5412 before reading. They encode the error correction level (L/M/Q/H) and which of 8 mask patterns was applied. The mask prevents large areas of same-colored modules which confuse scanners.'
  },
  {
    title: 'Data Reading',
    description: 'A cursor reads modules in a zig-zag pattern from the bottom-right corner, collecting 1s and 0s into a bitstream.',
    detail: 'Starting from the bottom-right, the reader moves in 2-column-wide zig-zag strips upward, then downward, skipping reserved areas. Each module is one bit. The bits are grouped into 8-bit codewords.'
  },
  {
    title: 'Error Correction',
    description: 'Reed-Solomon error correction bytes protect the data. Even if part of the QR code is damaged, it can still be fully recovered!',
    detail: 'The data codewords are followed by error correction codewords computed using Reed-Solomon polynomial math. Depending on the EC level, up to 30% of the code can be damaged and still be readable.'
  },
  {
    title: 'Final Decode',
    description: 'Each group of 8 bits becomes one byte, then one character. Watch the hidden message emerge letter by letter!',
    detail: 'The bitstream is parsed: a 4-bit mode indicator, a length field, then the payload. In byte mode each 8-bit group maps to an ASCII character. The characters assemble into the final decoded message.'
  }
];

export const STAGE_COLORS = ['#ff6b6b', '#6bcb77', '#9b59b6', '#ff6b6b', '#1abc9c'];

export const STAGE_DURATIONS = [10000, 12000, 18000, 10000, 15000];
