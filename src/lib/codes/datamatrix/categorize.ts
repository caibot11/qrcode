import type { DmVizData } from '@/lib/codes/types';
import {
  categorizeDmModules,
  computeDmDiagonalOrder,
  DmCat,
} from './helpers';
import { buildDmModel, type DmDecodeModel } from './model';

export interface DmModule {
  row: number;
  col: number;
  cat: DmCat;
  val: number;
  _y: number;
  _r: number;
  _g: number;
  _b: number;
  _scaleY: number;
}

export interface DmCategorized {
  modules: DmModule[];
  /**
   * Indices into modules[], in the REAL ECC200 placement read order, where
   * codeword k = dataModuleIndices[k*8 … k*8+8] (MSB→LSB). Falls back to a
   * diagonal sweep over data modules only if the model couldn't be built.
   */
  dataModuleIndices: number[];
  /** Count of data MODULES (data codewords × 8); EC modules follow in read order. */
  dataCodewordCount: number;
  /** Real decode (codewords/blocks/RS/symbols), or null if it couldn't be built. */
  model: DmDecodeModel | null;
}

export function categorizeDm(viz: DmVizData): DmCategorized {
  const size = viz.gridSize;
  const catInfo = categorizeDmModules(size);
  const model = buildDmModel(viz.moduleGrid);

  const modules: DmModule[] = catInfo.map(({ row, col, cat }) => ({
    row,
    col,
    cat,
    val: viz.moduleGrid[row][col],
    _y: 0,
    _r: 0,
    _g: 0,
    _b: 0,
    _scaleY: 1,
  }));

  const moduleMap = new Map<number, number>();
  modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));

  const dataModuleIndices: number[] = [];
  if (model) {
    // Real placement order: every codeword's 8 modules, in read order.
    for (const [r, c] of model.readOrder) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined) dataModuleIndices.push(idx);
    }
  } else {
    // Fallback: simplified diagonal sweep over the interior data region.
    for (const [r, c] of computeDmDiagonalOrder(size)) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined && modules[idx].cat === DmCat.Data) {
        dataModuleIndices.push(idx);
      }
    }
  }

  return {
    modules,
    dataModuleIndices,
    dataCodewordCount: model
      ? model.dataCodewords * 8
      : Math.floor(dataModuleIndices.length * 0.6),
    model,
  };
}
