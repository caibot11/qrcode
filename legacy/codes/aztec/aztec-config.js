import { AZTEC_STAGE_INFO, AZTEC_STAGE_COLORS, AZTEC_STAGE_DURATIONS } from './aztec-helpers.js';

export const AZTEC_CONFIG = {
  id: 'aztec',
  name: 'Aztec Code',
  stageCount: 5,
  stageLabels: ['Bullseye', 'Mode', 'Layers', 'Error Corr', 'Decode'],
  stageInfo: AZTEC_STAGE_INFO,
  stageColors: AZTEC_STAGE_COLORS,
  stageDurations: AZTEC_STAGE_DURATIONS,
  geometryType: 'grid',
  cameraPresets: null, // default grid-based, but starts zoomed in
  compareInfo: {
    description: 'A 2D matrix code with central bullseye and no required quiet zone.',
    strengths: ['No quiet zone needed', 'Central finder is highly detectable', 'Compact size'],
    weaknesses: ['Less widely supported', 'Lower max capacity', 'Less consumer recognition'],
    useCases: ['Boarding passes', 'Train tickets', 'Government IDs']
  }
};
