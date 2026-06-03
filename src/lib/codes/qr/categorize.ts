import type { QrVizData } from '@/lib/codes/types';
import {
  buildReservedMap,
  computeZigZagOrder,
  generateMaskGrid,
  getAlignmentPositions,
} from './helpers';
import { buildQrModel, type QrDecodeModel } from './model';

export const QrCat = {
  Finder: 0,
  Separator: 1,
  Timing: 2,
  Alignment: 3,
  Format: 4,
  Dark: 5,
  Data: 6,
} as const;
export type QrCat = (typeof QrCat)[keyof typeof QrCat];

export interface QrModule {
  row: number;
  col: number;
  cat: QrCat;
  /** raw grid value (after mask, as scanned) */
  val: number;
  // per-frame animation state — mutated by the scene during useFrame.
  _y: number;
  _r: number;
  _g: number;
  _b: number;
  _scaleY: number;
}

export interface QrCategorized {
  modules: QrModule[];
  reserved: Uint8Array[];
  zigzag: [number, number][];
  maskGrid: Uint8Array[];
  alignPositions: number[];
  /** moduleGrid with the mask XOR'd off, so data modules show their true bit */
  unmaskedGrid: Uint8Array[];
  /** indices into `modules` array, in zig-zag read order, data-modules only */
  dataModuleIndices: number[];
  /** Count of data codewords (vs error-correction codewords) — approximated as 60% */
  dataCodewordCount: number;
  /** Real decode (codewords/blocks/RS/symbols), or null if it couldn't be built. */
  model: QrDecodeModel | null;
}

/**
 * Categorize every module of a QR grid into structural categories so the
 * visualizer can highlight finder/timing/alignment/format/data independently.
 * Ported from legacy/codes/qr/qr-visualizer.js `categorizeModules`.
 */
export function categorizeQr(viz: QrVizData): QrCategorized {
  const size = viz.gridSize;
  const version = viz.version;

  const reserved = buildReservedMap(size, version);
  const zigzag = computeZigZagOrder(size, version);
  const maskGrid = generateMaskGrid(size, viz.formatInfo.maskPattern);
  const alignPositions = getAlignmentPositions(version);

  const unmaskedGrid: Uint8Array[] = viz.moduleGrid.map((row, r) => {
    const out = new Uint8Array(size);
    for (let c = 0; c < size; c++) {
      out[c] = reserved[r][c] ? row[c] : row[c] ^ maskGrid[r][c];
    }
    return out;
  });

  const fmtSet = new Set<number>();
  for (const [r, c] of viz.formatInfo.formatBitPositions) {
    fmtSet.add(r * size + c);
  }
  for (let i = 0; i < 7; i++) fmtSet.add((size - 1 - i) * size + 8);
  for (let i = 0; i < 8; i++) fmtSet.add(8 * size + (size - 8 + i));

  const alignSet = new Set<number>();
  for (const ar of alignPositions) {
    for (const ac of alignPositions) {
      if (ar < 9 && ac < 9) continue;
      if (ar < 9 && ac > size - 9) continue;
      if (ar > size - 9 && ac < 9) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          alignSet.add((ar + dr) * size + (ac + dc));
        }
      }
    }
  }

  const modules: QrModule[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = r * size + c;
      const val = viz.moduleGrid[r][c];
      let cat: QrCat;

      const inTLFinder = r < 7 && c < 7;
      const inTRFinder = r < 7 && c >= size - 7;
      const inBLFinder = r >= size - 7 && c < 7;

      if (inTLFinder || inTRFinder || inBLFinder) {
        cat = QrCat.Finder;
      } else if (
        (r < 8 && c === 7) ||
        (r === 7 && c < 8) ||
        (r < 8 && c === size - 8) ||
        (r === 7 && c >= size - 8) ||
        (r === size - 8 && c < 8) ||
        (r >= size - 8 && c === 7)
      ) {
        cat = QrCat.Separator;
      } else if (r === 4 * version + 9 && c === 8) {
        cat = QrCat.Dark;
      } else if (fmtSet.has(key)) {
        cat = QrCat.Format;
      } else if (alignSet.has(key)) {
        cat = QrCat.Alignment;
      } else if (
        (r === 6 && c > 7 && c < size - 8) ||
        (c === 6 && r > 7 && r < size - 8)
      ) {
        cat = QrCat.Timing;
      } else if (reserved[r][c]) {
        cat = QrCat.Separator;
      } else {
        cat = QrCat.Data;
      }

      modules.push({
        row: r,
        col: c,
        cat,
        val,
        _y: 0,
        _r: 0,
        _g: 0,
        _b: 0,
        _scaleY: 1,
      });
    }
  }

  // Precompute data-module indices in zig-zag read order.
  const moduleMap = new Map<number, number>();
  modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));
  const dataModuleIndices: number[] = [];
  for (const [r, c] of zigzag) {
    const idx = moduleMap.get(r * size + c);
    if (idx !== undefined) dataModuleIndices.push(idx);
  }

  // Real decode model (codewords / blocks / RS / symbols). The read order is
  // the genuine zig-zag, so it maps 1:1 onto dataModuleIndices.
  const model = buildQrModel(
    unmaskedGrid,
    zigzag,
    version,
    viz.formatInfo.errorCorrectionLevel,
  );

  return {
    modules,
    reserved,
    zigzag,
    maskGrid,
    alignPositions,
    unmaskedGrid,
    dataModuleIndices,
    dataCodewordCount: model
      ? model.dataCodewords * 8 // real data-module count
      : Math.floor(dataModuleIndices.length * 0.6),
    model,
  };
}
