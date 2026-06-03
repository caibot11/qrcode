import BitMatrixParser from '@zxing/library/esm/core/datamatrix/decoder/BitMatrixParser';
import type DmVersion from '@zxing/library/esm/core/datamatrix/decoder/Version';
import {
  BitMatrix,
  DataMatrixDecodedBitStreamParser,
  GenericGF,
  ReedSolomonDecoder,
} from '@zxing/library';

/**
 * A genuine (partial) Data Matrix decode of a module grid, used to drive the
 * accurate stage-3 (error correction) and stage-4 (decode) animations. Mirrors
 * the QR model: it reads codewords in the *real* ECC200 placement order, runs
 * the real Reed–Solomon decoder, and maps each output character back to the
 * exact bits/modules it came from. Reuses ZXing's `BitMatrixParser` (the same
 * code path the real decoder uses), so the read order is the genuine one — not
 * the old fake diagonal sweep.
 */
export interface DmSymbol {
  /** Decoded character(s) for this unit (1 byte = 1 char, digit-pair = 2). */
  chars: string;
  /** The exact bits of this unit's codeword(s), as a string of '0'/'1'. */
  bits: string;
  /** Raw-codeword indices (read order) this unit's bits live in. */
  codewords: number[];
}

export interface DmDecodeModel {
  /** Codeword modules in real placement read order; codeword k = readOrder[k*8 … k*8+8]. */
  readOrder: [number, number][];
  /** Real data/EC codeword counts (ISO 16022 Table 7, per symbol size). */
  dataCodewords: number;
  ecCodewords: number;
  numBlocks: number;
  ecPerBlock: number;
  /** Per raw-codeword: true if it's a data codeword (vs error-correction). */
  codewordIsData: boolean[];
  /** Decoded output symbols with their source bits + codewords. */
  symbols: DmSymbol[];
  /** Max correctable errors (codewords) = floor(ecPerBlock/2) per block. */
  correctable: number;
  /** The real decoded text. */
  decodedText: string;
}

/** Minimal view of the private parser internals we hook to capture read order. */
interface ParserInternals {
  mappingBitMatrix: { get(x: number, y: number): boolean };
  readMappingMatrix: { set(x: number, y: number): void };
  readModule(
    row: number,
    column: number,
    numRows: number,
    numColumns: number,
  ): boolean;
  readCodewords(): Int8Array;
  getVersion(): DmVersion;
}

/**
 * Build the decode model from a full Data Matrix module grid (with finder +
 * timing). Returns null if the grid can't be parsed (caller falls back to the
 * approximate behaviour).
 */
export function buildDmModel(moduleGrid: Uint8Array[]): DmDecodeModel | null {
  try {
    const h = moduleGrid.length;
    const w = moduleGrid[0].length;

    const bm = new BitMatrix(w, h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (moduleGrid[r][c]) bm.set(c, r);
      }
    }

    // Hook `readModule` (the single chokepoint every module access flows
    // through) to record the exact read order while ZXing reads the codewords.
    const parser = new BitMatrixParser(bm) as unknown as ParserInternals;
    const mapOrder: [number, number][] = []; // mapping-matrix coords, 8/codeword MSB→LSB
    parser.readModule = function (
      this: ParserInternals,
      row: number,
      column: number,
      numRows: number,
      numColumns: number,
    ): boolean {
      if (row < 0) {
        row += numRows;
        column += 4 - ((numRows + 4) & 0x07);
      }
      if (column < 0) {
        column += numColumns;
        row += 4 - ((numColumns + 4) & 0x07);
      }
      mapOrder.push([row, column]);
      this.readMappingMatrix.set(column, row);
      return this.mappingBitMatrix.get(column, row);
    };

    const rawCodewords = parser.readCodewords();
    const version = parser.getVersion();
    const total = version.getTotalCodewords();
    if (mapOrder.length !== total * 8) return null;

    // Convert mapping-matrix coords → full-symbol coords (re-inserting the
    // finder/timing borders that `extractDataRegion` stripped).
    const drR = version.getDataRegionSizeRows();
    const drC = version.getDataRegionSizeColumns();
    const readOrder: [number, number][] = mapOrder.map(([mr, mc]) => {
      const regR = (mr / drR) | 0;
      const i = mr % drR;
      const regC = (mc / drC) | 0;
      const j = mc % drC;
      return [regR * (drR + 2) + 1 + i, regC * (drC + 2) + 1 + j];
    });

    // De-interleave into Reed–Solomon blocks, tracking each codeword's raw
    // index. Mirrors ZXing's DataBlock.getDataBlocks (incl. the size-144 case).
    const ecBlocks = version.getECBlocks();
    const ecPerBlock = ecBlocks.getECCodewords();
    const blocks: { nd: number; cw: number[]; idx: number[] }[] = [];
    for (const ecb of ecBlocks.getECBlocks()) {
      for (let i = 0; i < ecb.getCount(); i++) {
        const nd = ecb.getDataCodewords();
        blocks.push({
          nd,
          cw: new Array(nd + ecPerBlock),
          idx: new Array(nd + ecPerBlock),
        });
      }
    }
    const longerTotal = blocks[0].cw.length;
    const longerData = longerTotal - ecPerBlock;
    const shorterData = longerData - 1;
    const special = version.getVersionNumber() === 24;
    let off = 0;
    for (let i = 0; i < shorterData; i++) {
      for (let j = 0; j < blocks.length; j++) {
        blocks[j].cw[i] = rawCodewords[off] & 0xff;
        blocks[j].idx[i] = off++;
      }
    }
    const numLonger = special ? 8 : blocks.length;
    for (let j = 0; j < numLonger; j++) {
      blocks[j].cw[longerData - 1] = rawCodewords[off] & 0xff;
      blocks[j].idx[longerData - 1] = off++;
    }
    const max = blocks[0].cw.length;
    for (let i = longerData; i < max; i++) {
      for (let j = 0; j < blocks.length; j++) {
        const jo = special ? (j + 8) % blocks.length : j;
        const io = special && jo > 7 ? i - 1 : i;
        blocks[jo].cw[io] = rawCodewords[off] & 0xff;
        blocks[jo].idx[io] = off++;
      }
    }

    // RS-correct each block; collect data bytes + their raw-codeword indices.
    const rs = new ReedSolomonDecoder(GenericGF.DATA_MATRIX_FIELD_256);
    const codewordIsData = new Array<boolean>(total).fill(false);
    const dataBytes: number[] = [];
    const dataRawIdx: number[] = [];
    let dataCodewords = 0;
    for (const blk of blocks) {
      dataCodewords += blk.nd;
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

    // Authoritative decoded text via ZXing (handles every encodation mode).
    let decodedText: string;
    try {
      decodedText = DataMatrixDecodedBitStreamParser.decode(
        Uint8Array.from(dataBytes),
      ).getText();
    } catch {
      return null;
    }

    // Per-unit bits→chars mapping (ASCII / digit-pair, the common case + our
    // demo). Stops at the first non-ASCII latch; `decodedText` above is still
    // complete, so stage 4 degrades gracefully for C40/Text/etc. live scans.
    const symbols = parseAsciiSymbols(dataBytes, dataRawIdx);

    return {
      readOrder,
      dataCodewords,
      ecCodewords: total - dataCodewords,
      numBlocks: blocks.length,
      ecPerBlock,
      codewordIsData,
      symbols,
      correctable: Math.floor(ecPerBlock / 2) * blocks.length,
      decodedText,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the Data Matrix data-codeword stream in ASCII encodation into output
 * symbols tagged with their source codeword + bits. Covers ASCII bytes,
 * two-digit packs, and pad; bails at the first mode latch (C40/Text/X12/…).
 */
function parseAsciiSymbols(
  dataBytes: number[],
  dataRawIdx: number[],
): DmSymbol[] {
  const syms: DmSymbol[] = [];
  let upperShift = false;
  for (let i = 0; i < dataBytes.length; i++) {
    const cw = dataBytes[i];
    const bits = cw.toString(2).padStart(8, '0');
    const idx = [dataRawIdx[i]];
    if (cw === 0) break;
    if (cw <= 128) {
      // ASCII data: value = codeword − 1 (+128 after an upper-shift).
      const v = (upperShift ? cw + 128 : cw) - 1;
      upperShift = false;
      syms.push({ chars: String.fromCharCode(v), bits, codewords: idx });
    } else if (cw === 129) {
      break; // pad / end-of-message
    } else if (cw <= 229) {
      // Two-digit pack 00–99 (value + 130).
      const v = cw - 130;
      syms.push({
        chars: (v < 10 ? '0' : '') + v,
        bits,
        codewords: idx,
      });
    } else if (cw === 235) {
      upperShift = true; // applies to the next ASCII byte
    } else if (cw === 232) {
      syms.push({ chars: String.fromCharCode(29), bits, codewords: idx }); // FNC1
    } else if (cw === 233 || cw === 234 || cw === 241) {
      // structured-append / reader-programming / ECI — no visible char
    } else {
      break; // C40/Base256/X12/Text/EDIFACT latch — stop detailed parsing
    }
  }
  return syms;
}
