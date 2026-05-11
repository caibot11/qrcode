import type { BarcodeVizData } from '@/lib/codes/types';

export interface BarcodeModule {
  /** segment index */
  index: number;
  /** center X position in world units (already shifted so total is centered around 0) */
  xCenter: number;
  /** width in module units */
  width: number;
  isBar: boolean;
  isGuard: boolean;
  isCheck: boolean;
  groupIndex: number;
  groupLabel: string;
  /** animated height multiplier (1 = flat, 30+ = tall pillar) */
  _scaleY: number;
  /** vertical offset (for "lift" animations) */
  _y: number;
  _r: number;
  _g: number;
  _b: number;
}

export interface BarcodeCategorized {
  modules: BarcodeModule[];
  /** total width of the barcode in module units (excluding quiet zones) */
  totalWidth: number;
  /** index of the check-digit group inside the segments list */
  checkGroupIndex: number;
}

const QUIET_ZONE = 10;
const TARGET_BAR_HEIGHT = 26; // tall pillar scaleY when "raised"

export function categorizeBarcode(viz: BarcodeVizData): BarcodeCategorized {
  const segments = viz.encoded.segments;
  const groupCount = viz.encoded.groupCount;
  const checkGroupIndex = groupCount - 2; // Check is second to last

  // Compute cumulative x (centered around 0).
  let totalWidth = 0;
  for (const s of segments) totalWidth += s.width;

  // x = 0 corresponds to the start of the barcode; we shift so center is at 0.
  const half = totalWidth / 2;
  let cursorX = 0;

  const modules: BarcodeModule[] = segments.map((s) => {
    const xLeft = cursorX;
    cursorX += s.width;
    const xCenter = xLeft + s.width / 2 - half;

    return {
      index: s.index,
      xCenter,
      width: s.width,
      isBar: s.isBar,
      isGuard: s.groupIndex === 0 || s.groupIndex === groupCount - 1,
      isCheck: s.groupIndex === checkGroupIndex,
      groupIndex: s.groupIndex,
      groupLabel: s.groupLabel,
      _scaleY: 1,
      _y: 0,
      _r: 0,
      _g: 0,
      _b: 0,
    };
  });

  return {
    modules,
    totalWidth: totalWidth + QUIET_ZONE * 2,
    checkGroupIndex,
  };
}

export const BAR_TARGET_HEIGHT = TARGET_BAR_HEIGHT;
