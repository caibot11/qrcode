import type { AztecVizData } from '@/lib/codes/types';
import {
  AztecCat,
  categorizeAztecModules,
  computeAztecSpiralOrder,
  getBullseyeRing,
} from './helpers';
import { buildAztecModel, type AztecDecodeModel } from './model';

export interface AztecModule {
  row: number;
  col: number;
  cat: AztecCat;
  ring: number;
  val: number;
  _y: number;
  _r: number;
  _g: number;
  _b: number;
  _scaleY: number;
}

export interface AztecCategorized {
  modules: AztecModule[];
  /**
   * Indices into modules[], in the REAL spiral read order, where codeword c =
   * dataModuleIndices[c*codewordSize … +codewordSize]. Falls back to a
   * concentric ring sweep if the model couldn't be built.
   */
  dataModuleIndices: number[];
  /** Count of data MODULES (data codewords × codewordSize). */
  dataCodewordCount: number;
  /** Bits per codeword (6/8/10/12); 8 in the fallback. */
  codewordSize: number;
  /** Real decode (read order / RS / symbols), or null if it couldn't be built. */
  model: AztecDecodeModel | null;
}

export function categorizeAztec(viz: AztecVizData): AztecCategorized {
  const size = viz.gridSize;
  const center = Math.floor(size / 2);
  const model = buildAztecModel(viz.moduleGrid, {
    compact: viz.compact,
    nbLayers: viz.nbLayers,
    nbDataBlocks: viz.nbDataBlocks,
  });

  let modules: AztecModule[];
  const dataModuleIndices: number[] = [];
  let codewordSize = 8;

  if (model) {
    // Categorize from the real structure: data = the genuine codeword modules;
    // the central rings = bullseye; the mode-message ring = mode; the rest
    // (orientation marks / reference grid / padding) = structure (bullseye).
    const dataSet = new Set<number>();
    for (const [r, c] of model.readOrder) dataSet.add(r * size + c);
    const coreRadius = model.compact ? 4 : 6;
    const modeRadius = model.compact ? 5 : 7;

    modules = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const ring = getBullseyeRing(r, c, center);
        let cat: AztecCat;
        if (dataSet.has(r * size + c)) cat = AztecCat.Data;
        else if (ring <= coreRadius) cat = AztecCat.Bullseye;
        else if (ring === modeRadius) cat = AztecCat.Mode;
        else cat = AztecCat.Bullseye;
        modules.push({
          row: r,
          col: c,
          cat,
          ring,
          val: viz.moduleGrid[r][c],
          _y: 0,
          _r: 0,
          _g: 0,
          _b: 0,
          _scaleY: 1,
        });
      }
    }

    const moduleMap = new Map<number, number>();
    modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));
    for (const [r, c] of model.readOrder) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined) dataModuleIndices.push(idx);
    }
    codewordSize = model.codewordSize;
  } else {
    // Fallback: ring-based categorization + concentric spiral sweep.
    const catInfo = categorizeAztecModules(size);
    modules = catInfo.map(({ row, col, cat, ring }) => ({
      row,
      col,
      cat,
      ring,
      val: viz.moduleGrid[row][col],
      _y: 0,
      _r: 0,
      _g: 0,
      _b: 0,
      _scaleY: 1,
    }));
    const moduleMap = new Map<number, number>();
    modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));
    for (const [r, c] of computeAztecSpiralOrder(size)) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined && modules[idx].cat === AztecCat.Data) {
        dataModuleIndices.push(idx);
      }
    }
  }

  return {
    modules,
    dataModuleIndices,
    dataCodewordCount: model
      ? model.dataCodewords * model.codewordSize
      : Math.floor(dataModuleIndices.length * 0.6),
    codewordSize,
    model,
  };
}
