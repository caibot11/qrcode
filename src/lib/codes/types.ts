export type CodeKind = 'qr' | 'barcode' | 'datamatrix' | 'aztec';

export interface StageConfig {
  /** i18n key for the full kid-friendly title — used in InfoCard */
  titleKey: string;
  /** i18n key for the short label — used in stage chips (must fit on a chip) */
  labelKey: string;
  /** i18n key for the short explanation paragraph */
  bodyKey: string;
  /** stage duration in ms */
  duration: number;
}

// ===== QR =====

export interface QrFormatInfo {
  raw: number;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  maskPattern: number;
  ecLevel: number;
  formatBitPositions: [number, number][];
}

export interface QrVizData {
  kind: 'qr';
  version: number;
  gridSize: number;
  /** indexed [row][col]; 1 = dark module, 0 = light */
  moduleGrid: Uint8Array[];
  formatInfo: QrFormatInfo;
  decodedText: string;
  chunks?: unknown[];
  binaryData?: number[];
}

// ===== Data Matrix =====

export interface DmVizData {
  kind: 'datamatrix';
  gridSize: number;
  /** indexed [row][col]; 1 = dark, 0 = light */
  moduleGrid: Uint8Array[];
  decodedText: string;
  version: number;
}

// ===== Aztec =====

export interface AztecVizData {
  kind: 'aztec';
  gridSize: number;
  /** indexed [row][col] */
  moduleGrid: Uint8Array[];
  decodedText: string;
  version: number;
  /** symbol metadata (from the encoder/detector) — lets the model decode the grid */
  compact?: boolean;
  nbLayers?: number;
  nbDataBlocks?: number;
}

// ===== Barcode =====

export interface BarSegment {
  /** column index (0..N-1) along the bar */
  index: number;
  /** width in module units (1..4 for Code 128) */
  width: number;
  /** true if this segment is a bar, false if a space */
  isBar: boolean;
  /** index of the character group this segment belongs to */
  groupIndex: number;
  /** human-readable group label ('Start', a character, 'Check', 'Stop') */
  groupLabel: string;
}

export interface BarcodeGroup {
  /** group index within the symbol (0 = Start) */
  groupIndex: number;
  /** display label: 'Start' | the data character | 'Check' | 'Stop' | guard name */
  label: string;
  /** the character this group encodes ('' for guards) */
  char: string;
  /** the symbol value (Code 128: 0..106; EAN/UPC: the digit; -1 for guards) */
  value: number;
  /** the bar/space element widths, in module units */
  widths: number[];
  /** true for start/stop/center guard patterns (glow, no value shown) */
  isGuard?: boolean;
  /** true if this group is a decoded message character (revealed in stage 4) */
  isData?: boolean;
}

export interface BarcodeEncoded {
  text: string;
  segments: BarSegment[];
  /** per-group decode info (Start … data … Check … Stop) */
  groups: BarcodeGroup[];
  /** number of character groups (start + chars + check + stop) */
  groupCount: number;
  checkDigit: number;
  /** symbology of the rendered bars */
  format?: 'code128' | 'ean13' | 'upca';
}

export interface BarcodeVizData {
  kind: 'barcode';
  decodedText: string;
  encoded: BarcodeEncoded;
}

// ===== Union =====

export type VizData = QrVizData | DmVizData | AztecVizData | BarcodeVizData;
