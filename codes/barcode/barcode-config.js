import { BARCODE_STAGE_INFO, BARCODE_STAGE_COLORS, BARCODE_STAGE_DURATIONS } from './barcode-helpers.js';

export const BARCODE_CONFIG = {
  id: 'barcode',
  name: 'Barcode (Code 128)',
  stageCount: 5,
  stageLabels: ['Structure', 'Encoding', 'Scanner', 'Check', 'Decode'],
  stageInfo: BARCODE_STAGE_INFO,
  stageColors: BARCODE_STAGE_COLORS,
  stageDurations: BARCODE_STAGE_DURATIONS,
  geometryType: 'grid',
  cameraPresets: {
    default: { pos: [0, 14, 35], target: [0, 3, 0] }
  },
  compareInfo: {
    description: 'A 1D linear code using variable-width bars with a check digit.',
    strengths: ['Fast laser scanning', 'Compact for short data', 'Universal retail support'],
    weaknesses: ['Limited capacity (~20 chars)', 'Single-direction scanning', 'No error correction'],
    useCases: ['Retail', 'Shipping', 'Inventory']
  }
};
