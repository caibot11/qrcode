/**
 * Code 128 (subset B) encoder for the educational demo. Not exhaustive —
 * covers ASCII 32..79 which is enough for short kid-friendly messages.
 * Ported from legacy/codes/barcode/barcode-helpers.js.
 */

import type { BarSegment, BarcodeEncoded } from '@/lib/codes/types';

interface Code128Entry {
  char: string;
  val: number;
  /** 6 bar/space widths (in module units 1..4) — bar, space, bar, space, bar, space */
  pattern: number[];
}

const CODE128B_TABLE: Code128Entry[] = [
  { char: ' ', val: 0, pattern: [2, 1, 2, 2, 2, 2] },
  { char: '!', val: 1, pattern: [2, 2, 2, 1, 2, 2] },
  { char: '"', val: 2, pattern: [2, 2, 2, 2, 2, 1] },
  { char: '#', val: 3, pattern: [1, 2, 1, 2, 2, 3] },
  { char: '$', val: 4, pattern: [1, 2, 1, 3, 2, 2] },
  { char: '%', val: 5, pattern: [1, 3, 1, 2, 2, 2] },
  { char: '&', val: 6, pattern: [1, 2, 2, 2, 1, 3] },
  { char: "'", val: 7, pattern: [1, 2, 2, 3, 1, 2] },
  { char: '(', val: 8, pattern: [1, 3, 2, 2, 1, 2] },
  { char: ')', val: 9, pattern: [2, 2, 1, 2, 1, 3] },
  { char: '*', val: 10, pattern: [2, 2, 1, 3, 1, 2] },
  { char: '+', val: 11, pattern: [2, 3, 1, 2, 1, 2] },
  { char: ',', val: 12, pattern: [1, 1, 2, 2, 3, 2] },
  { char: '-', val: 13, pattern: [1, 2, 2, 1, 3, 2] },
  { char: '.', val: 14, pattern: [1, 2, 2, 2, 3, 1] },
  { char: '/', val: 15, pattern: [1, 1, 3, 2, 2, 2] },
  { char: '0', val: 16, pattern: [1, 2, 3, 1, 2, 2] },
  { char: '1', val: 17, pattern: [1, 2, 3, 2, 2, 1] },
  { char: '2', val: 18, pattern: [2, 2, 3, 2, 1, 1] },
  { char: '3', val: 19, pattern: [2, 2, 1, 1, 3, 2] },
  { char: '4', val: 20, pattern: [2, 2, 1, 2, 3, 1] },
  { char: '5', val: 21, pattern: [2, 1, 3, 2, 1, 2] },
  { char: '6', val: 22, pattern: [2, 2, 3, 1, 1, 2] },
  { char: '7', val: 23, pattern: [3, 1, 2, 1, 3, 1] },
  { char: '8', val: 24, pattern: [3, 1, 1, 2, 2, 2] },
  { char: '9', val: 25, pattern: [3, 2, 1, 1, 2, 2] },
  { char: ':', val: 26, pattern: [3, 2, 1, 2, 2, 1] },
  { char: ';', val: 27, pattern: [3, 1, 2, 2, 1, 2] },
  { char: '<', val: 28, pattern: [3, 2, 2, 1, 1, 2] },
  { char: '=', val: 29, pattern: [3, 2, 2, 2, 1, 1] },
  { char: '>', val: 30, pattern: [2, 1, 2, 1, 2, 3] },
  { char: '?', val: 31, pattern: [2, 1, 2, 3, 2, 1] },
  { char: '@', val: 32, pattern: [2, 3, 2, 1, 2, 1] },
  { char: 'A', val: 33, pattern: [1, 1, 1, 3, 2, 3] },
  { char: 'B', val: 34, pattern: [1, 3, 1, 1, 2, 3] },
  { char: 'C', val: 35, pattern: [1, 3, 1, 3, 2, 1] },
  { char: 'D', val: 36, pattern: [1, 1, 2, 3, 2, 2] },
  { char: 'E', val: 37, pattern: [1, 3, 2, 1, 2, 2] },
  { char: 'F', val: 38, pattern: [1, 3, 2, 3, 2, 1] },
  { char: 'G', val: 39, pattern: [2, 1, 1, 3, 2, 2] },
  { char: 'H', val: 40, pattern: [2, 3, 1, 1, 2, 2] },
  { char: 'I', val: 41, pattern: [2, 3, 1, 3, 2, 1] },
  { char: 'J', val: 42, pattern: [1, 1, 2, 1, 3, 3] },
  { char: 'K', val: 43, pattern: [1, 1, 2, 3, 3, 1] },
  { char: 'L', val: 44, pattern: [1, 3, 2, 1, 3, 1] },
  { char: 'M', val: 45, pattern: [1, 1, 3, 1, 2, 3] },
  { char: 'N', val: 46, pattern: [1, 1, 3, 3, 2, 1] },
  { char: 'O', val: 47, pattern: [1, 3, 3, 1, 2, 1] },
];

const START_B: Code128Entry = {
  char: 'Start',
  val: 104,
  pattern: [2, 1, 1, 2, 3, 2],
};
const STOP: Code128Entry = {
  char: 'Stop',
  val: 106,
  pattern: [2, 3, 3, 1, 1, 1, 2],
};

const charMap = new Map<string, Code128Entry>();
for (const entry of CODE128B_TABLE) charMap.set(entry.char, entry);

/**
 * Encode a short string into Code 128B segments + check digit. Falls back
 * gracefully if a character isn't in the table — the demo strings stick to
 * letters present in CODE128B_TABLE.
 */
export function encodeCode128(text: string): BarcodeEncoded {
  const groups: { entry: Code128Entry; label: string }[] = [];

  // Start B
  groups.push({ entry: START_B, label: 'Start' });

  // Data chars
  for (const ch of text) {
    const entry = charMap.get(ch.toUpperCase());
    if (entry) {
      groups.push({ entry, label: ch });
    }
  }

  // Check digit
  let sum = START_B.val;
  for (let i = 0; i < text.length; i++) {
    const entry = charMap.get(text[i].toUpperCase());
    if (entry) sum += entry.val * (i + 1);
  }
  const checkVal = sum % 103;
  const checkEntry =
    CODE128B_TABLE.find((e) => e.val === checkVal) ?? CODE128B_TABLE[0];
  groups.push({ entry: { ...checkEntry, val: checkVal }, label: 'Check' });

  // Stop
  groups.push({ entry: STOP, label: 'Stop' });

  // Flatten into segments
  const segments: BarSegment[] = [];
  let segmentIndex = 0;
  for (let g = 0; g < groups.length; g++) {
    const { entry, label } = groups[g];
    for (let j = 0; j < entry.pattern.length; j++) {
      segments.push({
        index: segmentIndex++,
        width: entry.pattern[j],
        isBar: j % 2 === 0,
        groupIndex: g,
        groupLabel: label,
      });
    }
  }

  return {
    text,
    segments,
    groupCount: groups.length,
    checkDigit: checkVal,
  };
}
