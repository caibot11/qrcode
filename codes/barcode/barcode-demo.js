// Hardcoded Code 128 barcode demo for "HELLO"
import { encodeCode128 } from './barcode-helpers.js';

export const DEMO_BARCODE = buildDemoBarcode();

function buildDemoBarcode() {
  const encoded = encodeCode128('HELLO');
  const barHeight = 16; // units tall

  // gridSize = number of bar/space elements + padding
  // Each element in totalBars is one column in the 3D grid
  const gridSize = Math.max(encoded.totalBars.length + 4, 20);

  return {
    gridSize,
    encoded,
    decodedText: 'HELLO',
    barHeight
  };
}
