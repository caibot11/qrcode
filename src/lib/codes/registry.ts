import type { CodeKind, StageConfig } from './types';
import { QR_STAGES } from './qr/config';
import { BARCODE_STAGES } from './barcode/config';
import { DM_STAGES } from './datamatrix/config';
import { AZTEC_STAGES } from './aztec/config';

/**
 * Stage definitions keyed by code type. Used by InfoCard + StageBar to
 * show the right titles/labels for whichever code the user is viewing.
 */
export const STAGES_BY_KIND: Record<CodeKind, readonly StageConfig[]> = {
  qr: QR_STAGES,
  barcode: BARCODE_STAGES,
  datamatrix: DM_STAGES,
  aztec: AZTEC_STAGES,
};
