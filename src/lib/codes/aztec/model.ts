import AztecDecoder from '@zxing/library/esm/core/aztec/decoder/Decoder';
import AztecDetectorResult from '@zxing/library/esm/core/aztec/AztecDetectorResult';
import { BitMatrix, GenericGF, ReedSolomonDecoder } from '@zxing/library';

/**
 * A genuine Aztec decode of a module grid, used to drive the accurate stage-2
 * (real spiral read order), stage-3 (error correction), and stage-4 (decode)
 * animations. Mirrors the QR/DM models. The data-layer "domino spiral" read
 * order is NOT exposed by ZXing's public API, so the bit-extraction order is
 * ported verbatim from ZXing's `Decoder.extractBits` (ISO/IEC 24778) — the same
 * traversal the real decoder uses — while recording each module's coordinates.
 * The decoded text comes from ZXing's own `Decoder` (authoritative).
 */
export interface AztecSymbol {
  /** Decoded character(s) for this bitstream symbol. */
  chars: string;
  /** The exact code bits that produced this symbol (post-destuffing). */
  bits: string;
  /** Data-codeword indices this symbol's bits live in. */
  codewords: number[];
}

export interface AztecDecodeModel {
  /** Codeword modules in real read order; codeword c = readOrder[c*cwSize … +cwSize]. */
  readOrder: [number, number][];
  /** Bits per Aztec codeword (6/8/10/12, from the layer count). */
  codewordSize: number;
  dataCodewords: number;
  ecCodewords: number;
  numCodewords: number;
  /** Per codeword index: true if it's a data codeword (vs error-correction). */
  codewordIsData: boolean[];
  /** Decoded output symbols with their source bits + codewords. */
  symbols: AztecSymbol[];
  /** Max correctable errors (codewords) = floor(ec/2). */
  correctable: number;
  /** The real decoded text. */
  decodedText: string;
  compact: boolean;
  nbLayers: number;
}

export interface AztecMeta {
  compact?: boolean;
  nbLayers?: number;
  nbDataBlocks?: number;
}

function trunc(a: number, b: number): number {
  return Math.trunc(a / b);
}
function totalBitsInLayer(layers: number, compact: boolean): number {
  return ((compact ? 88 : 112) + 16 * layers) * layers;
}

/**
 * Analytic port of ZXing `Decoder.extractBits`: returns, for each raw bit in
 * read order, the [row, col] of the module it comes from (incl. the full-code
 * reference-grid `alignmentMap`).
 */
function extractReadOrder(
  layers: number,
  compact: boolean,
): [number, number][] {
  const baseMatrixSize = (compact ? 11 : 14) + layers * 4;
  const alignmentMap = new Int32Array(baseMatrixSize);
  const n = totalBitsInLayer(layers, compact);
  const coords = new Array<[number, number]>(n);
  if (compact) {
    for (let i = 0; i < alignmentMap.length; i++) alignmentMap[i] = i;
  } else {
    const matrixSize =
      baseMatrixSize + 1 + 2 * trunc(trunc(baseMatrixSize, 2) - 1, 15);
    const origCenter = baseMatrixSize / 2;
    const center = trunc(matrixSize, 2);
    for (let i = 0; i < origCenter; i++) {
      const newOffset = i + trunc(i, 15);
      alignmentMap[origCenter - i - 1] = center - newOffset - 1;
      alignmentMap[origCenter + i] = center + newOffset + 1;
    }
  }
  const put = (idx: number, x: number, y: number) => {
    coords[idx] = [y, x];
  };
  for (let i = 0, rowOffset = 0; i < layers; i++) {
    const rowSize = (layers - i) * 4 + (compact ? 9 : 12);
    const low = i * 2;
    const high = baseMatrixSize - 1 - low;
    for (let j = 0; j < rowSize; j++) {
      const columnOffset = j * 2;
      for (let k = 0; k < 2; k++) {
        put(rowOffset + columnOffset + k, alignmentMap[low + k], alignmentMap[low + j]);
        put(rowOffset + 2 * rowSize + columnOffset + k, alignmentMap[low + j], alignmentMap[high - k]);
        put(rowOffset + 4 * rowSize + columnOffset + k, alignmentMap[high - k], alignmentMap[high - j]);
        put(rowOffset + 6 * rowSize + columnOffset + k, alignmentMap[high - j], alignmentMap[low + k]);
      }
    }
    rowOffset += rowSize * 8;
  }
  return coords;
}

function readCode(bits: boolean[], start: number, len: number): number {
  let res = 0;
  for (let i = start; i < start + len; i++) {
    res <<= 1;
    if (bits[i]) res |= 1;
  }
  return res;
}

function gfFor(layers: number): { gf: GenericGF; cw: number } {
  if (layers <= 2) return { gf: GenericGF.AZTEC_DATA_6, cw: 6 };
  if (layers <= 8) return { gf: GenericGF.AZTEC_DATA_8, cw: 8 };
  if (layers <= 22) return { gf: GenericGF.AZTEC_DATA_10, cw: 10 };
  return { gf: GenericGF.AZTEC_DATA_12, cw: 12 };
}

// Aztec decoder character tables (ISO/IEC 24778), from ZXing Decoder.
const UPPER = ['CTRL_PS', ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'CTRL_LL', 'CTRL_ML', 'CTRL_DL', 'CTRL_BS'];
const LOWER = ['CTRL_PS', ' ', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'CTRL_US', 'CTRL_ML', 'CTRL_DL', 'CTRL_BS'];
const MIXED = ['CTRL_PS', ' ', '\x01', '\x02', '\x03', '\x04', '\x05', '\x06', '\x07', '\b', '\t', '\n', '\x0b', '\f', '\r', '\x1b', '\x1c', '\x1d', '\x1e', '\x1f', '@', '\\', '^', '_', '`', '|', '~', '\x7f', 'CTRL_LL', 'CTRL_UL', 'CTRL_PL', 'CTRL_BS'];
const PUNCT = ['', '\r', '\r\n', '. ', ', ', ': ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/', ':', ';', '<', '=', '>', '?', '[', ']', '{', '}', 'CTRL_UL'];
const DIGIT = ['CTRL_PS', ' ', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '.', 'CTRL_UL', 'CTRL_US'];

type Tbl = 0 | 1 | 2 | 3 | 4 | 5;
const T_UPPER: Tbl = 0;
const T_LOWER: Tbl = 1;
const T_MIXED: Tbl = 2;
const T_DIGIT: Tbl = 3;
const T_PUNCT: Tbl = 4;
const T_BINARY: Tbl = 5;

function getTable(c: string): Tbl {
  switch (c) {
    case 'L': return T_LOWER;
    case 'P': return T_PUNCT;
    case 'M': return T_MIXED;
    case 'D': return T_DIGIT;
    case 'B': return T_BINARY;
    default: return T_UPPER;
  }
}
function getChar(t: Tbl, code: number): string {
  switch (t) {
    case T_UPPER: return UPPER[code];
    case T_LOWER: return LOWER[code];
    case T_MIXED: return MIXED[code];
    case T_PUNCT: return PUNCT[code];
    default: return DIGIT[code];
  }
}

/**
 * Build the Aztec decode model from a module grid + symbol metadata. Returns
 * null if metadata is missing or the grid can't be decoded (caller falls back).
 */
export function buildAztecModel(
  moduleGrid: Uint8Array[],
  meta: AztecMeta,
): AztecDecodeModel | null {
  const { compact, nbLayers, nbDataBlocks } = meta;
  if (compact === undefined || nbLayers === undefined || nbDataBlocks === undefined) {
    return null;
  }
  try {
    const size = moduleGrid.length;

    // Real read order (every codeword's modules, in spiral order).
    const coords = extractReadOrder(nbLayers, compact);
    const rawbits = coords.map(([r, c]) => moduleGrid[r][c] === 1);

    const { gf, cw: codewordSize } = gfFor(nbLayers);
    const numCodewords = Math.floor(rawbits.length / codewordSize);
    if (numCodewords < nbDataBlocks) return null;
    const offset = rawbits.length % codewordSize;

    // Codeword bit-region modules (drop the leading `offset` padding bits, so
    // codeword c occupies readOrder[c*cwSize … +cwSize]).
    const readOrder = coords.slice(offset);

    // Read + RS-correct the codewords.
    const dataWords = new Int32Array(numCodewords);
    for (let i = 0, off = offset; i < numCodewords; i++, off += codewordSize) {
      dataWords[i] = readCode(rawbits, off, codewordSize);
    }
    try {
      new ReedSolomonDecoder(gf).decode(dataWords, numCodewords - nbDataBlocks);
    } catch {
      /* leave as-read if uncorrectable */
    }

    // Bit de-stuffing → corrected data bitstream, tracking each corrected bit's
    // source codeword so output characters can be mapped back to modules.
    const mask = (1 << codewordSize) - 1;
    let stuffed = 0;
    for (let i = 0; i < nbDataBlocks; i++) {
      const dw = dataWords[i];
      if (dw === 0 || dw === mask) return null;
      else if (dw === 1 || dw === mask - 1) stuffed++;
    }
    const correctedBits: boolean[] = new Array(nbDataBlocks * codewordSize - stuffed);
    const corrCw: number[] = new Array(correctedBits.length);
    let bi = 0;
    for (let i = 0; i < nbDataBlocks; i++) {
      const dw = dataWords[i];
      if (dw === 1 || dw === mask - 1) {
        const v = dw > 1;
        for (let z = 0; z < codewordSize - 1; z++) { correctedBits[bi] = v; corrCw[bi] = i; bi++; }
      } else {
        for (let bit = codewordSize - 1; bit >= 0; --bit) { correctedBits[bi] = (dw & (1 << bit)) !== 0; corrCw[bi] = i; bi++; }
      }
    }

    // Parse the corrected bitstream into output symbols, tagging each with the
    // codewords (and thus modules) its bits came from.
    const symbols = parseSymbols(correctedBits, corrCw);

    // Authoritative decoded text via ZXing's own decoder.
    const bm = new BitMatrix(size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (moduleGrid[r][c]) bm.set(c, r);
    let decodedText: string;
    try {
      const det = new AztecDetectorResult(bm, [], compact, nbDataBlocks, nbLayers);
      decodedText = new AztecDecoder().decode(det).getText();
    } catch {
      decodedText = symbols.map((s) => s.chars).join('');
    }

    const codewordIsData = Array.from({ length: numCodewords }, (_, c) => c < nbDataBlocks);

    return {
      readOrder,
      codewordSize,
      dataCodewords: nbDataBlocks,
      ecCodewords: numCodewords - nbDataBlocks,
      numCodewords,
      codewordIsData,
      symbols,
      correctable: Math.floor((numCodewords - nbDataBlocks) / 2),
      decodedText,
      compact,
      nbLayers,
    };
  } catch {
    return null;
  }
}

/**
 * Port of ZXing `Decoder.getEncodedData`, but emitting one symbol per visible
 * character with the bit range it occupies, mapped to its source data
 * codewords. Mode latches/shifts consume bits but emit no symbol.
 */
function parseSymbols(
  correctedBits: boolean[],
  corrCw: number[],
): AztecSymbol[] {
  const end = correctedBits.length;
  const syms: AztecSymbol[] = [];
  let latch: Tbl = T_UPPER;
  let shift: Tbl = T_UPPER;
  let index = 0;
  const emit = (chars: string, start: number, stop: number) => {
    if (!chars) return;
    let bits = '';
    const cwset = new Set<number>();
    for (let b = start; b < stop; b++) {
      bits += correctedBits[b] ? '1' : '0';
      cwset.add(corrCw[b]);
    }
    syms.push({ chars, bits, codewords: [...cwset].sort((a, b) => a - b) });
  };
  while (index < end) {
    if (shift === T_BINARY) {
      if (end - index < 5) break;
      let len = readCode(correctedBits, index, 5);
      index += 5;
      if (len === 0) {
        if (end - index < 11) break;
        len = readCode(correctedBits, index, 11) + 31;
        index += 11;
      }
      for (let cc = 0; cc < len; cc++) {
        if (end - index < 8) { index = end; break; }
        const code = readCode(correctedBits, index, 8);
        emit(String.fromCharCode(code), index, index + 8);
        index += 8;
      }
      shift = latch;
    } else {
      const sizeBits = shift === T_DIGIT ? 4 : 5;
      if (end - index < sizeBits) break;
      const code = readCode(correctedBits, index, sizeBits);
      const start = index;
      index += sizeBits;
      const str = getChar(shift, code);
      if (str.startsWith('CTRL_')) {
        latch = shift;
        shift = getTable(str.charAt(5));
        if (str.charAt(6) === 'L') latch = shift;
      } else {
        emit(str, start, index);
        shift = latch;
      }
    }
  }
  return syms;
}
