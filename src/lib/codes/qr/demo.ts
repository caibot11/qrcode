import type { QrVizData } from '@/lib/codes/types';
import QrEncoder from '@zxing/library/esm/core/qrcode/encoder/Encoder';
import { EncodeHintType, QRCodeDecoderErrorCorrectionLevel } from '@zxing/library';
import { readFormatInfo } from '@/lib/decode/format';

/**
 * A REAL QR code for "HELLO WORLD" — produced by ZXing's QR encoder (real
 * data + Reed–Solomon codewords, real mask selection, real format bits), not a
 * synthetic LFSR fill. The decode model re-reads this grid back to
 * "HELLO WORLD", so every stage animates the true algorithm. Forced to
 * Version 2 (25×25) for a substantial exhibit; EC level M. "HELLO WORLD" lands
 * in alphanumeric mode (11 bits per 2 characters) — a nice contrast to the
 * Data Matrix / Aztec byte-mode demos.
 */
export const DEMO_QR: QrVizData = buildDemoQR('HELLO WORLD');

function buildDemoQR(text: string): QrVizData {
  const hints = new Map<EncodeHintType, unknown>();
  hints.set(EncodeHintType.QR_VERSION, 2);
  const qr = QrEncoder.encode(text, QRCodeDecoderErrorCorrectionLevel.M, hints);
  const mat = qr.getMatrix();
  const size = mat.getWidth();
  const version = qr.getVersion().getVersionNumber();

  const grid: Uint8Array[] = Array.from({ length: size }, (_, r) => {
    const row = new Uint8Array(size);
    for (let c = 0; c < size; c++) row[c] = mat.get(c, r) ? 1 : 0;
    return row;
  });

  // Read EC level + mask + format-bit positions back from the encoded grid, so
  // the categorizer unmasks with the exact mask ZXing applied.
  const formatInfo = readFormatInfo(grid);

  return {
    kind: 'qr',
    version,
    gridSize: size,
    moduleGrid: grid,
    formatInfo,
    decodedText: text,
    chunks: [],
    binaryData: [],
  };
}
