import { STAGE_INFO, STAGE_COLORS, STAGE_DURATIONS } from './qr-helpers.js';

export const QR_CONFIG = {
  id: 'qr',
  name: 'QR Code',
  stageCount: 5,
  stageLabels: ['Structure', 'Format', 'Data', 'Error Corr', 'Decode'],
  stageInfo: STAGE_INFO,
  stageColors: STAGE_COLORS,
  stageDurations: STAGE_DURATIONS,
  geometryType: 'grid',
  // cameraPresets computed dynamically based on gridSize in loadCodeType
  cameraPresets: null,
  compareInfo: {
    description: 'A 2D matrix code with three finder patterns and Reed-Solomon error correction.',
    strengths: [
      'High data capacity (up to 4,296 characters)',
      'Strong error correction — up to 30% damage recovery',
      'Fast scanning from any angle',
      'Widely supported'
    ],
    weaknesses: [
      'Requires large area for small data',
      'Finder patterns take up space',
      'Needs quiet zone border'
    ],
    useCases: ['URLs', 'Payments', 'Product tracking', 'Wi-Fi sharing']
  }
};
