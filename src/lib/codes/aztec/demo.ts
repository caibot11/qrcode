import type { AztecVizData } from '@/lib/codes/types';
import AztecEncoder from '@zxing/library/esm/core/aztec/encoder/Encoder';
import StringUtils from '@zxing/library/esm/core/common/StringUtils';
import StandardCharsets from '@zxing/library/esm/core/util/StandardCharsets';

/**
 * A REAL Aztec encoding of "Nerdz!" — produced by ZXing's Aztec encoder
 * (high-level encodation + real Reed–Solomon over GF(64) + the genuine
 * ISO/IEC 24778 domino-spiral placement), not a synthetic LFSR fill. The
 * decode model re-reads this grid back to "Nerdz!", so every stage animates
 * the true algorithm.
 *
 * "Nerdz!" lands in a 15×15 compact symbol, 1 layer: 7 data + 10 EC codewords
 * of 6 bits each — matching the previous demo's size while now being authentic.
 * The metadata (compact / layers / data blocks) lets the model decode the grid.
 */
export const DEMO_AZTEC: AztecVizData = buildDemoAztec('Nerdz!');

function buildDemoAztec(text: string): AztecVizData {
  const code = AztecEncoder.encodeBytes(
    StringUtils.getBytes(text, StandardCharsets.ISO_8859_1),
  );
  const matrix = code.getMatrix();
  const size = matrix.getWidth();
  const grid: Uint8Array[] = Array.from({ length: size }, (_, r) => {
    const row = new Uint8Array(size);
    for (let c = 0; c < size; c++) row[c] = matrix.get(c, r) ? 1 : 0;
    return row;
  });

  return {
    kind: 'aztec',
    gridSize: size,
    moduleGrid: grid,
    decodedText: text,
    version: 1,
    compact: code.isCompact(),
    nbLayers: code.getLayers(),
    nbDataBlocks: code.getCodeWords(),
  };
}
