import type { BarcodeVizData } from '@/lib/codes/types';
import { encodeCode128 } from './helpers';

/**
 * Code 128B demo encoding "HELLO". Encoded segments are pre-computed so the
 * scene can immediately render bars + spaces.
 */
export const DEMO_BARCODE: BarcodeVizData = {
  kind: 'barcode',
  decodedText: 'HELLO',
  encoded: encodeCode128('HELLO'),
};
