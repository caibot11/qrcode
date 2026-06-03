import Version from '@zxing/library/esm/core/qrcode/decoder/Version';
import {
  GenericGF,
  QRCodeDecoderErrorCorrectionLevel,
  ReedSolomonDecoder,
} from '@zxing/library';
import type { QrFormatInfo } from '@/lib/codes/types';

/**
 * A genuine (partial) QR decode of a module grid, used to drive accurate
 * stage-3 (error correction) and stage-4 (decode) animations:
 *  - reads codewords in the real zig-zag order,
 *  - de-interleaves them into the real Reed–Solomon blocks (with the per-block
 *    data/EC codeword counts from the QR spec, not a 60% guess),
 *  - runs the real RS decoder, and
 *  - parses the data bitstream into output symbols, mapping each character group
 *    back to the exact bits and modules it came from.
 */
export interface QrSymbol {
  /** Decoded character(s) for this bitstream symbol (1 byte, 2 alnum, 3 numeric…). */
  chars: string;
  /** The exact bits of this symbol, as a string of '0'/'1'. */
  bits: string;
  /** Raw-codeword indices this symbol's bits live in. */
  codewords: number[];
}

export interface QrDecodeModel {
  /** Data-region modules in real zig-zag read order; codeword k = modules[k*8 … k*8+8]. */
  readOrder: [number, number][];
  /** Real data/EC codeword counts (spec, per version + EC level). */
  dataCodewords: number;
  ecCodewords: number;
  numBlocks: number;
  ecPerBlock: number;
  /** Per raw-codeword: true if it's a data codeword (vs error-correction). */
  codewordIsData: boolean[];
  /** Decoded output symbols with their source bits + codewords. */
  symbols: QrSymbol[];
  /** Max correctable errors (codewords) = floor(ecPerBlock/2) per block. */
  correctable: number;
  /** The real decoded text. */
  decodedText: string;
}

const EC_LEVELS: Record<
  QrFormatInfo['errorCorrectionLevel'],
  QRCodeDecoderErrorCorrectionLevel
> = {
  L: QRCodeDecoderErrorCorrectionLevel.L,
  M: QRCodeDecoderErrorCorrectionLevel.M,
  Q: QRCodeDecoderErrorCorrectionLevel.Q,
  H: QRCodeDecoderErrorCorrectionLevel.H,
};

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/**
 * Build the decode model from an UNMASKED grid + version + EC level + the real
 * zig-zag read order. Returns null if anything is inconsistent (caller falls
 * back to the approximate behaviour).
 */
export function buildQrModel(
  unmaskedGrid: Uint8Array[],
  readOrder: [number, number][],
  version: number,
  ecLevel: QrFormatInfo['errorCorrectionLevel'],
): QrDecodeModel | null {
  try {
    const ver = Version.getVersionForNumber(version);
    const ecl = EC_LEVELS[ecLevel];
    const ecBlocks = ver.getECBlocksForLevel(ecl);
    const ecPerBlock = ecBlocks.getECCodewordsPerBlock();

    // Read raw codewords (MSB first) from the unmasked data modules.
    const nCw = Math.floor(readOrder.length / 8);
    const raw = new Uint8Array(nCw);
    for (let i = 0; i < nCw; i++) {
      let b = 0;
      for (let k = 0; k < 8; k++) {
        const [r, c] = readOrder[i * 8 + k];
        b = (b << 1) | (unmaskedGrid[r][c] ? 1 : 0);
      }
      raw[i] = b;
    }

    // De-interleave into blocks, tracking each codeword's raw index.
    const blocks: { nd: number; cw: number[]; idx: number[] }[] = [];
    for (const ecb of ecBlocks.getECBlocks()) {
      for (let i = 0; i < ecb.getCount(); i++) {
        const nd = ecb.getDataCodewords();
        blocks.push({
          nd,
          cw: new Array(ecPerBlock + nd),
          idx: new Array(ecPerBlock + nd),
        });
      }
    }
    const shortTot = blocks[0].cw.length;
    let lstart = blocks.length - 1;
    while (lstart >= 0 && blocks[lstart].cw.length !== shortTot) lstart--;
    lstart++;
    const shortData = shortTot - ecPerBlock;
    let off = 0;
    for (let i = 0; i < shortData; i++) {
      for (let j = 0; j < blocks.length; j++) {
        blocks[j].cw[i] = raw[off];
        blocks[j].idx[i] = off++;
      }
    }
    for (let j = lstart; j < blocks.length; j++) {
      blocks[j].cw[shortData] = raw[off];
      blocks[j].idx[shortData] = off++;
    }
    const maxLen = blocks[0].cw.length;
    for (let i = shortData; i < maxLen; i++) {
      for (let j = 0; j < blocks.length; j++) {
        const io = j < lstart ? i : i + 1;
        blocks[j].cw[io] = raw[off];
        blocks[j].idx[io] = off++;
      }
    }

    // RS-correct each block; collect data bytes + their raw-codeword indices.
    const rs = new ReedSolomonDecoder(GenericGF.QR_CODE_FIELD_256);
    const dataBytes: number[] = [];
    const dataRawIdx: number[] = [];
    const codewordIsData = new Array<boolean>(nCw).fill(false);
    for (const blk of blocks) {
      const arr = Int32Array.from(blk.cw);
      try {
        rs.decodeWithECCount(arr, ecPerBlock);
      } catch {
        /* leave as-read if uncorrectable */
      }
      for (let i = 0; i < blk.nd; i++) {
        dataBytes.push(arr[i] & 0xff);
        dataRawIdx.push(blk.idx[i]);
        codewordIsData[blk.idx[i]] = true;
      }
    }
    const db = Uint8Array.from(dataBytes);

    // Parse the data bitstream into symbols with bit ranges.
    const symbols = parseBitstream(db, version, dataRawIdx);
    if (!symbols) return null;

    let dataCodewords = 0;
    for (const blk of blocks) dataCodewords += blk.nd;

    return {
      readOrder,
      dataCodewords,
      ecCodewords: nCw - dataCodewords,
      numBlocks: blocks.length,
      ecPerBlock,
      codewordIsData,
      symbols,
      correctable: Math.floor(ecPerBlock / 2) * blocks.length,
      decodedText: symbols.map((s) => s.chars).join(''),
    };
  } catch {
    return null;
  }
}

function charCountBits(version: number, mode: 'num' | 'aln' | 'byte'): number {
  if (mode === 'num') return version < 10 ? 10 : version < 27 ? 12 : 14;
  if (mode === 'aln') return version < 10 ? 9 : version < 27 ? 11 : 13;
  return version < 10 ? 8 : 16;
}

/**
 * Parse the QR data bitstream (numeric / alphanumeric / byte) into output
 * symbols, each tagged with the raw codewords its bits span. Returns null on an
 * unsupported mode (Kanji/ECI) so the caller can fall back.
 */
function parseBitstream(
  db: Uint8Array,
  version: number,
  dataRawIdx: number[],
): QrSymbol[] | null {
  const totalBits = db.length * 8;
  let pos = 0;
  const read = (n: number): number => {
    let x = 0;
    for (let k = 0; k < n; k++) {
      const byte = db[pos >> 3];
      const bit = (byte >> (7 - (pos & 7))) & 1;
      x = (x << 1) | bit;
      pos++;
    }
    return x;
  };
  const bitsStr = (start: number, end: number): string => {
    let s = '';
    for (let p = start; p < end; p++) {
      const byte = db[p >> 3];
      s += (byte >> (7 - (p & 7))) & 1;
    }
    return s;
  };
  const codewordsFor = (start: number, end: number): number[] => {
    const out: number[] = [];
    for (let cw = start >> 3; cw <= (end - 1) >> 3; cw++) {
      if (cw < dataRawIdx.length) out.push(dataRawIdx[cw]);
    }
    return out;
  };
  const push = (chars: string, start: number, syms: QrSymbol[]) => {
    syms.push({ chars, bits: bitsStr(start, pos), codewords: codewordsFor(start, pos) });
  };

  const syms: QrSymbol[] = [];
  while (totalBits - pos >= 4) {
    const mode = read(4);
    if (mode === 0) break; // terminator
    if (mode === 1) {
      let n = read(charCountBits(version, 'num'));
      while (n > 0) {
        const start = pos;
        let s: string;
        if (n >= 3) { s = String(read(10)).padStart(3, '0'); n -= 3; }
        else if (n === 2) { s = String(read(7)).padStart(2, '0'); n -= 2; }
        else { s = String(read(4)); n -= 1; }
        push(s, start, syms);
      }
    } else if (mode === 2) {
      let n = read(charCountBits(version, 'aln'));
      while (n > 0) {
        const start = pos;
        let s: string;
        if (n >= 2) { const x = read(11); s = ALNUM[Math.floor(x / 45)] + ALNUM[x % 45]; n -= 2; }
        else { s = ALNUM[read(6)]; n -= 1; }
        push(s, start, syms);
      }
    } else if (mode === 4) {
      const n = read(charCountBits(version, 'byte'));
      for (let i = 0; i < n; i++) {
        const start = pos;
        const b = read(8);
        push(String.fromCharCode(b), start, syms);
      }
    } else {
      return null; // Kanji / ECI / structured-append unsupported → fall back
    }
  }
  return syms;
}
