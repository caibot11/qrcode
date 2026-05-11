// Code 128 helpers — encoding table, check digit math
import { easeOutCubic, lerp, hexToRgbNorm } from '../qr/qr-helpers.js';
export { easeOutCubic, lerp, hexToRgbNorm };

// Code 128 character set B (ASCII 32-127)
// Each entry: [bar pattern as 6-element widths array, character, value]
// Pattern: alternating bars and spaces starting with bar
// Widths are relative (1-4 units each, total = 11 units per character)
const CODE128B_TABLE = [
  { char: ' ', val: 0, pattern: [2,1,2,2,2,2] },
  { char: '!', val: 1, pattern: [2,2,2,1,2,2] },
  { char: '"', val: 2, pattern: [2,2,2,2,2,1] },
  { char: '#', val: 3, pattern: [1,2,1,2,2,3] },
  { char: '$', val: 4, pattern: [1,2,1,3,2,2] },
  { char: '%', val: 5, pattern: [1,3,1,2,2,2] },
  { char: '&', val: 6, pattern: [1,2,2,2,1,3] },
  { char: "'", val: 7, pattern: [1,2,2,3,1,2] },
  { char: '(', val: 8, pattern: [1,3,2,2,1,2] },
  { char: ')', val: 9, pattern: [2,2,1,2,1,3] },
  { char: '*', val: 10, pattern: [2,2,1,3,1,2] },
  { char: '+', val: 11, pattern: [2,3,1,2,1,2] },
  { char: ',', val: 12, pattern: [1,1,2,2,3,2] },
  { char: '-', val: 13, pattern: [1,2,2,1,3,2] },
  { char: '.', val: 14, pattern: [1,2,2,2,3,1] },
  { char: '/', val: 15, pattern: [1,1,3,2,2,2] },
  { char: '0', val: 16, pattern: [1,2,3,1,2,2] },
  { char: '1', val: 17, pattern: [1,2,3,2,2,1] },
  { char: '2', val: 18, pattern: [2,2,3,2,1,1] },
  { char: '3', val: 19, pattern: [2,2,1,1,3,2] },
  { char: '4', val: 20, pattern: [2,2,1,2,3,1] },
  { char: '5', val: 21, pattern: [2,1,3,2,1,2] },
  { char: '6', val: 22, pattern: [2,2,3,1,1,2] },
  { char: '7', val: 23, pattern: [3,1,2,1,3,1] },
  { char: '8', val: 24, pattern: [3,1,1,2,2,2] },
  { char: '9', val: 25, pattern: [3,2,1,1,2,2] },
  { char: ':', val: 26, pattern: [3,2,1,2,2,1] },
  { char: ';', val: 27, pattern: [3,1,2,2,1,2] },
  { char: '<', val: 28, pattern: [3,2,2,1,1,2] },
  { char: '=', val: 29, pattern: [3,2,2,2,1,1] },
  { char: '>', val: 30, pattern: [2,1,2,1,2,3] },
  { char: '?', val: 31, pattern: [2,1,2,3,2,1] },
  { char: '@', val: 32, pattern: [2,3,2,1,2,1] },
  { char: 'A', val: 33, pattern: [1,1,1,3,2,3] },
  { char: 'B', val: 34, pattern: [1,3,1,1,2,3] },
  { char: 'C', val: 35, pattern: [1,3,1,3,2,1] },
  { char: 'D', val: 36, pattern: [1,1,2,3,2,2] },  // Simplified patterns for Demo
  { char: 'E', val: 37, pattern: [1,3,2,1,2,2] },
  { char: 'F', val: 38, pattern: [1,3,2,3,2,0] },
  { char: 'G', val: 39, pattern: [2,1,1,3,2,2] },  // Approximated patterns
  { char: 'H', val: 40, pattern: [2,3,1,1,2,2] },
  { char: 'I', val: 41, pattern: [2,3,1,3,2,0] },
  { char: 'J', val: 42, pattern: [1,1,2,1,3,3] },
  { char: 'K', val: 43, pattern: [1,1,2,3,3,1] },
  { char: 'L', val: 44, pattern: [1,3,2,1,3,1] },
  { char: 'M', val: 45, pattern: [1,1,3,1,2,3] },
  { char: 'N', val: 46, pattern: [1,1,3,3,2,1] },
  { char: 'O', val: 47, pattern: [1,3,3,1,2,1] },
];

// Start Code B
const START_B = { label: 'Start B', val: 104, pattern: [2,1,1,2,3,2] };
// Stop pattern (7 bars instead of 6)
const STOP = { label: 'Stop', val: 106, pattern: [2,3,3,1,1,1,2] };

const charMap = new Map();
for (const entry of CODE128B_TABLE) {
  charMap.set(entry.char, entry);
}

/**
 * Encode a string into Code 128B bar data
 * Returns { chars: [{char, val, pattern, label}], checkDigit, totalBars: [{x, width, isBar, groupIndex, groupLabel}] }
 */
export function encodeCode128(text) {
  const chars = [];

  // Start code
  chars.push({ ...START_B, groupLabel: 'Start' });

  // Data characters
  for (const ch of text) {
    const entry = charMap.get(ch);
    if (entry) {
      chars.push({ ...entry, groupLabel: ch });
    }
  }

  // Calculate check digit
  let sum = START_B.val;
  for (let i = 0; i < text.length; i++) {
    const entry = charMap.get(text[i]);
    if (entry) {
      sum += entry.val * (i + 1);
    }
  }
  const checkVal = sum % 103;
  // Find check character
  const checkEntry = CODE128B_TABLE.find(e => e.val === checkVal) || CODE128B_TABLE[checkVal] || CODE128B_TABLE[0];
  chars.push({ ...checkEntry, groupLabel: 'Check', val: checkVal });

  // Stop
  chars.push({ ...STOP, groupLabel: 'Stop' });

  // Convert to bar list
  const totalBars = [];
  const quietWidth = 10; // quiet zone width in units
  let xPos = quietWidth;

  for (let g = 0; g < chars.length; g++) {
    const ch = chars[g];
    const pattern = ch.pattern;
    for (let j = 0; j < pattern.length; j++) {
      const w = pattern[j];
      const isBar = (j % 2 === 0); // even index = bar, odd = space
      totalBars.push({
        x: xPos,
        width: w,
        isBar,
        groupIndex: g,
        groupLabel: ch.groupLabel
      });
      xPos += w;
    }
  }

  return {
    chars,
    checkDigit: checkVal,
    totalBars,
    totalWidth: xPos + quietWidth,
    quietWidth,
    text
  };
}

export const BARCODE_STAGE_INFO = [
  {
    title: 'Bar Structure',
    description: 'Bars rise left-to-right. Guard bars glow at the start and end. Quiet zones provide scanner clearance.',
    detail: 'A Code 128 barcode starts with a start character, followed by data characters, a check digit, and a stop character. Each character is encoded as a pattern of bars and spaces with specific widths.'
  },
  {
    title: 'Width Encoding',
    description: 'Each character is encoded as a pattern of 6 alternating bars and spaces with different widths.',
    detail: 'Code 128 uses 4 different bar widths (1-4 units). Each character pattern totals 11 units. The specific width combination uniquely identifies each character from a set of 106 possibilities.'
  },
  {
    title: 'Scanner Sweep',
    description: 'A red laser line sweeps across the barcode, reading the pattern of wide and narrow bars.',
    detail: 'A barcode scanner detects transitions between bars and spaces. It measures the relative widths to decode each character group. Unlike 2D codes, barcodes are read along a single line.'
  },
  {
    title: 'Check Digit',
    description: 'The check digit verifies the barcode was read correctly using a weighted sum calculation.',
    detail: 'The check digit is calculated as: (start value + sum of each character value × its position) mod 103. If the scanner\'s calculation doesn\'t match, it knows an error occurred.'
  },
  {
    title: 'Final Decode',
    description: 'Each bar pattern resolves to its character. The hidden message is assembled left to right.',
    detail: 'After validation, each character group\'s bar pattern is looked up in the Code 128 table to get the corresponding ASCII character. The characters are concatenated to form the final decoded string.'
  }
];

export const BARCODE_STAGE_COLORS = ['#4d96ff', '#6bcb77', '#ff6b6b', '#ffd93d', '#1abc9c'];
export const BARCODE_STAGE_DURATIONS = [8000, 10000, 12000, 8000, 10000];
