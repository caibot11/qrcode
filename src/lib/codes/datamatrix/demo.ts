import type { DmVizData } from '@/lib/codes/types';
import { BarcodeFormat, DataMatrixWriter } from '@zxing/library';

/**
 * A REAL ECC200 Data Matrix encoding "Nerdz!" — produced by ZXing's encoder
 * (high-level ASCII encodation + real Reed–Solomon + the genuine ISO 16022
 * module placement), not a synthetic LFSR fill. The decode model re-reads this
 * grid back to "Nerdz!", so every stage animates the true algorithm.
 *
 * "Nerdz!" lands in a 14×14 symbol: 8 data + 10 EC codewords, and its 12×12
 * data region is exactly 18×8 = 144 modules, so every interior cell is a real
 * codeword module (no fixed-pattern leftovers). It stays in pure ASCII mode, so
 * each codeword maps to exactly one character — ideal for the reveal.
 */
export const DEMO_DM: DmVizData = buildDemoDm('Nerdz!');

function buildDemoDm(text: string): DmVizData {
  const matrix = new DataMatrixWriter().encode(
    text,
    BarcodeFormat.DATA_MATRIX,
    0,
    0,
  );
  const size = matrix.getHeight();
  const grid: Uint8Array[] = Array.from({ length: size }, (_, r) => {
    const row = new Uint8Array(matrix.getWidth());
    for (let c = 0; c < matrix.getWidth(); c++) {
      row[c] = matrix.get(c, r) ? 1 : 0;
    }
    return row;
  });

  return {
    kind: 'datamatrix',
    gridSize: size,
    moduleGrid: grid,
    decodedText: text,
    version: 3, // ISO 16022 symbol #3 (14×14)
  };
}
