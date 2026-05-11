import type { AztecVizData } from '@/lib/codes/types';
import {
  AztecCat,
  categorizeAztecModules,
  computeAztecSpiralOrder,
} from './helpers';

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
  dataModuleIndices: number[];
  dataCodewordCount: number;
}

export function categorizeAztec(viz: AztecVizData): AztecCategorized {
  const size = viz.gridSize;
  const catInfo = categorizeAztecModules(size);
  const spiral = computeAztecSpiralOrder(size);

  const modules: AztecModule[] = catInfo.map(({ row, col, cat, ring }) => ({
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

  const dataModuleIndices: number[] = [];
  for (const [r, c] of spiral) {
    const idx = moduleMap.get(r * size + c);
    if (idx !== undefined && modules[idx].cat === AztecCat.Data) {
      dataModuleIndices.push(idx);
    }
  }

  return {
    modules,
    dataModuleIndices,
    dataCodewordCount: Math.floor(dataModuleIndices.length * 0.6),
  };
}
