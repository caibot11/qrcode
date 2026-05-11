import { DM_STAGE_INFO, DM_STAGE_COLORS, DM_STAGE_DURATIONS } from './dm-helpers.js';

export const DM_CONFIG = {
  id: 'datamatrix',
  name: 'Data Matrix',
  stageCount: 5,
  stageLabels: ['L-Finder', 'Clock', 'Data', 'Error Corr', 'Decode'],
  stageInfo: DM_STAGE_INFO,
  stageColors: DM_STAGE_COLORS,
  stageDurations: DM_STAGE_DURATIONS,
  geometryType: 'grid',
  cameraPresets: null, // uses default grid-based
  compareInfo: {
    description: 'A 2D matrix code with L-shape finder and clock track, optimized for tiny items.',
    strengths: ['Very small footprint', 'Strong error correction', 'Works on curved surfaces'],
    weaknesses: ['Lower max capacity than QR', 'Less consumer recognition'],
    useCases: ['Electronics marking', 'Pharma', 'Aerospace']
  }
};
