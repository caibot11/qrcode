import type { DmVizData } from '@/lib/codes/types';
import {
  categorizeDmModules,
  computeDmDiagonalOrder,
  DmCat,
} from './helpers';

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
  /** Indices into modules[], in diagonal read order, data-modules only */
  dataModuleIndices: number[];
  /** ~60% of data modules are "data", the rest are EC */
  dataCodewordCount: number;
}

export function categorizeDm(viz: DmVizData): DmCategorized {
  const size = viz.gridSize;
  const catInfo = categorizeDmModules(size);
  const diag = computeDmDiagonalOrder(size);

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
  for (const [r, c] of diag) {
    const idx = moduleMap.get(r * size + c);
    if (idx !== undefined && modules[idx].cat === DmCat.Data) {
      dataModuleIndices.push(idx);
    }
  }

  return {
    modules,
    dataModuleIndices,
    dataCodewordCount: Math.floor(dataModuleIndices.length * 0.6),
  };
}
