export type CodeKind = 'qr' | 'barcode' | 'datamatrix' | 'aztec';

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

export type VizData = QrVizData;
