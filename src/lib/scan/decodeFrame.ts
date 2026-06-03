import jsQR from 'jsqr';
import {
  AztecCodeReader,
  AztecDetector,
  BarcodeFormat,
  BinaryBitmap,
  DataMatrixReader,
  DecodeHintType,
  EncodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  QRCodeDecoderErrorCorrectionLevel,
  RGBLuminanceSource,
  type BitMatrix,
  type Reader,
  type Result,
} from '@zxing/library';
// Deep imports: these aren't re-exported from the package root, but the package
// has no "exports" map, so the node-resolution path is valid and Vite bundles
// them from source.
import DataMatrixDetector from '@zxing/library/esm/core/datamatrix/detector/Detector';
import QrEncoder from '@zxing/library/esm/core/qrcode/encoder/Encoder';
import type {
  AztecVizData,
  DmVizData,
  QrVizData,
  VizData,
} from '@/lib/codes/types';
import { extractModuleGrid, type QrLocation } from '@/lib/decode/grid';
import { readFormatInfo, writeFormatInfo } from '@/lib/decode/format';
import { buildReservedMap, generateMaskGrid } from '@/lib/codes/qr/helpers';
import { encodeCode128, encodeEan13, encodeUpcA } from '@/lib/codes/barcode/helpers';

/**
 * Decode a single raw camera frame into VizData for the 3D visualizer.
 *
 * Strategy per symbology:
 *  - QR          → jsQR locates the symbol; we then extract the REAL module
 *                  grid + REAL 15 format bits from the frame (authentic pixels).
 *  - DataMatrix  → ZXing reads the text; we also run ZXing's detector to pull
 *    & Aztec       the REAL sampled module matrix out of the frame (authentic
 *                  pixels). If detection/orientation is unusable we fall back
 *                  to a structurally-correct grid seeded by the decoded text.
 *  - 1D barcode  → ZXing reads the text; we re-render it as Code 128 segments
 *                  (the scenes are built from text via encodeCode128 anyway).
 *
 * Returns null when no code is found in the frame.
 */

// Reader instances reused across frames. We call each reader directly rather
// than via MultiFormatReader: MultiFormatReader console.warns on every failed
// format (an instanceof quirk in zxing-js), which would spam the console once
// per frame while no code is present. Calling readers ourselves and catching
// their NotFoundException keeps the console clean and skips formats we don't
// visualize (PDF417, MaxiCode, Micro-QR).
const dmReader = new DataMatrixReader();
const aztecReader = new AztecCodeReader();
const oneDReader = new MultiFormatOneDReader();

// "Try harder" makes the readers scan more rows and try the reversed row, which
// is essential for handheld product barcodes (EAN-13/UPC) — they're never
// perfectly aligned, and without it they often don't decode at all.
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
]);

const EC_LEVELS = {
  L: QRCodeDecoderErrorCorrectionLevel.L,
  M: QRCodeDecoderErrorCorrectionLevel.M,
  Q: QRCodeDecoderErrorCorrectionLevel.Q,
  H: QRCodeDecoderErrorCorrectionLevel.H,
} as const;

export function decodeFrame(imageData: ImageData): VizData | null {
  // 1) QR first — jsQR gives us corner geometry + version, which lets us pull
  //    the genuine module grid and format bits out of the frame.
  const qr = tryQr(imageData);
  if (qr) return qr;

  // 2) Everything else via ZXing.
  return tryZxing(imageData);
}

function tryQr(imageData: ImageData): QrVizData | null {
  let result: ReturnType<typeof jsQR>;
  try {
    result = jsQR(imageData.data, imageData.width, imageData.height, {
      // Don't also scan the inverted frame — printed codes are dark-on-light,
      // and 'attemptBoth' roughly doubles the chance of a false positive (a
      // stray Data Matrix / box edge read as a QR).
      inversionAttempts: 'dontInvert',
    });
  } catch {
    return null;
  }
  if (!result || !result.location) return null;

  const version = result.version ?? 1;
  const gridSize = 4 * version + 17;
  const loc = result.location;
  const location: QrLocation = {
    topLeftFinderPattern: loc.topLeftFinderPattern,
    topRightFinderPattern: loc.topRightFinderPattern,
    bottomLeftFinderPattern: loc.bottomLeftFinderPattern,
    bottomRightAlignmentPattern: loc.bottomRightAlignmentPattern,
  };

  let moduleGrid: Uint8Array[];
  try {
    moduleGrid = extractModuleGrid(imageData, location, version);
  } catch {
    return null;
  }
  if (moduleGrid.length !== gridSize) return null;

  // Read the error-correction level + mask from the scanned format bits (these
  // sit next to the finders and survive a noisy capture).
  const formatInfo = readFormatInfo(moduleGrid);
  const text = result.data ?? '';
  if (!text) return null; // a hit with no data is a jsQR false positive

  // Re-encode the decoded text into a pristine matrix. We render ONLY codes we
  // can faithfully reconstruct: if the re-encode fails — a false positive, or a
  // version jsQR mis-detected — we bail (letting the other readers try) rather
  // than show the raw camera sample, which is an unreadable "blob". Prefer
  // jsQR's version; fall back to letting ZXing pick if the text doesn't fit it.
  const ec = formatInfo.errorCorrectionLevel;
  const clean = reencodeQr(text, ec, version) ?? reencodeQr(text, ec);
  if (!clean) return null;

  const outGrid = clean.grid;
  const outSize = outGrid.length;
  const outVersion = (outSize - 17) / 4;

  // If the clean grid matches what we sampled, re-mask it to the physical code's
  // mask for an exact 1:1 copy; otherwise keep ZXing's own mask + format bits.
  let outFormat = formatInfo;
  if (outSize === gridSize) {
    if (formatInfo.maskPattern !== clean.mask) {
      remaskGrid(outGrid, outVersion, clean.mask, formatInfo.maskPattern, formatInfo.ecLevel);
    }
  } else {
    outFormat = readFormatInfo(outGrid);
  }

  return {
    kind: 'qr',
    version: outVersion,
    gridSize: outSize,
    moduleGrid: outGrid,
    formatInfo: outFormat,
    decodedText: text,
    binaryData: result.binaryData,
    chunks: result.chunks,
  };
}

// Re-mask a grid from `fromMask` to `toMask` in place: XOR the data region with
// the difference of the two mask patterns and rewrite the format bits. The
// function patterns (finders/timing/alignment/dark) are mask-independent.
function remaskGrid(
  grid: Uint8Array[],
  version: number,
  fromMask: number,
  toMask: number,
  ecBits: number,
): void {
  const size = grid.length;
  const reserved = buildReservedMap(size, version);
  const mFrom = generateMaskGrid(size, fromMask);
  const mTo = generateMaskGrid(size, toMask);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c]) grid[r][c] ^= mFrom[r][c] ^ mTo[r][c];
    }
  }
  writeFormatInfo(grid, ecBits, toMask);
}

// Re-encode text into a clean QR module grid at a forced version + EC level.
// Returns the grid (1 = dark) and the mask ZXing applied, or null on failure.
function reencodeQr(
  text: string,
  ecLevel: 'L' | 'M' | 'Q' | 'H',
  version?: number,
): { grid: Uint8Array[]; mask: number } | null {
  if (!text) return null;
  try {
    const hints = new Map<EncodeHintType, unknown>();
    // No version hint → ZXing picks the smallest version that fits the text.
    if (version) hints.set(EncodeHintType.QR_VERSION, version);
    const qr = QrEncoder.encode(text, EC_LEVELS[ecLevel], hints);
    const mat = qr.getMatrix();
    const size = mat.getWidth();
    if (mat.getHeight() !== size) return null;
    const grid: Uint8Array[] = Array.from(
      { length: size },
      () => new Uint8Array(size),
    );
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mat.get(c, r)) grid[r][c] = 1;
      }
    }
    return { grid, mask: qr.getMaskPattern() };
  } catch {
    return null;
  }
}

function tryZxing(imageData: ImageData): VizData | null {
  // ZXing's RGBLuminanceSource treats a Uint8ClampedArray verbatim as the
  // luminance buffer (it only converts Int32Array packed-RGB). So we must hand
  // it a real 1-byte-per-pixel luminance array — feeding the raw RGBA bytes
  // makes it read interleaved channels and decode nothing.
  const { data, width, height } = imageData;
  const lum = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < lum.length; i++, j += 4) {
    lum[i] = (data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114) | 0;
  }
  const source = new RGBLuminanceSource(lum, width, height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));

  // Try the 2D readers first (richest visualizations), then 1D barcodes.
  // On a hit we run the matching detector to recover the real module grid.
  const dm = tryReader(dmReader, bitmap);
  if (dm !== null) return buildDm(dm.getText() ?? '', extractDmGrid(bitmap));

  const az = tryReader(aztecReader, bitmap);
  if (az !== null) return buildAztec(az.getText() ?? '', extractAztecGrid(bitmap));

  const bc = tryReader(oneDReader, bitmap);
  if (bc !== null) return buildBarcode(bc.getText() ?? '', bc.getBarcodeFormat());

  return null;
}

// Returns the decoded text, or null if this reader found nothing in the frame.
function tryReader(reader: Reader, bitmap: BinaryBitmap): Result | null {
  try {
    return reader.decode(bitmap, HINTS);
  } catch {
    return null;
  } finally {
    reader.reset();
  }
}

// --------------------------------------------------------------------------
// Real module-grid extraction (authentic scanned pixels) for DM + Aztec
// --------------------------------------------------------------------------

// Returns the genuine sampled module matrix, or null if it can't be recovered
// or isn't a shape the scene can render (it then falls back to a seeded grid).
function extractDmGrid(bitmap: BinaryBitmap): Uint8Array[] | null {
  try {
    const black = bitmap.getBlackMatrix();
    const bits = new DataMatrixDetector(black).detect().getBits();
    return bitMatrixToGrid(bits);
  } catch {
    return null;
  }
}

interface AztecDetected {
  grid: Uint8Array[];
  compact: boolean;
  nbLayers: number;
  nbDataBlocks: number;
}

function extractAztecGrid(bitmap: BinaryBitmap): AztecDetected | null {
  try {
    const black = bitmap.getBlackMatrix();
    const res = new AztecDetector(black).detect();
    const grid = bitMatrixToGrid(res.getBits());
    if (!grid) return null;
    return {
      grid,
      compact: res.isCompact(),
      nbLayers: res.getNbLayers(),
      nbDataBlocks: res.getNbDatablocks(),
    };
  } catch {
    return null;
  }
}

// DM and Aztec symbols are square; the scenes index a square grid. Reject
// anything non-square or implausibly sized so a bad detection never crashes
// the categorizer — the builder falls back to a seeded grid instead.
function bitMatrixToGrid(bits: BitMatrix): Uint8Array[] | null {
  const w = bits.getWidth();
  const h = bits.getHeight();
  if (w !== h || w < 8 || w > 151) return null;
  const grid = blankGrid(h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (bits.get(c, r)) grid[r][c] = 1;
    }
  }
  return grid;
}

// --------------------------------------------------------------------------
// Builders for symbologies whose 3D grid is re-rendered from the decoded text
// --------------------------------------------------------------------------

function buildBarcode(text: string, format: BarcodeFormat): VizData {
  let encoded: ReturnType<typeof encodeCode128>;
  if (format === BarcodeFormat.EAN_13 && /^\d{13}$/.test(text)) {
    encoded = encodeEan13(text);
  } else if (format === BarcodeFormat.UPC_A && /^\d{12}$/.test(text)) {
    encoded = encodeUpcA(text);
  } else if (format === BarcodeFormat.UPC_A && /^\d{13}$/.test(text)) {
    encoded = encodeEan13(text); // some readers return UPC-A with the leading 0
  } else {
    encoded = encodeCode128(text);
  }
  return { kind: 'barcode', decodedText: text, encoded };
}

function buildDm(text: string, realGrid: Uint8Array[] | null): DmVizData {
  if (realGrid) {
    return {
      kind: 'datamatrix',
      gridSize: realGrid.length,
      moduleGrid: realGrid,
      decodedText: text,
      version: 1,
    };
  }

  // Fallback: structurally-correct grid seeded by the decoded text.
  const size = 16;
  const grid = blankGrid(size);

  // L-shape finder: solid bottom row + solid left column.
  for (let c = 0; c < size; c++) grid[size - 1][c] = 1;
  for (let r = 0; r < size; r++) grid[r][0] = 1;
  // Clock track: alternating top row + right column.
  for (let c = 0; c < size; c++) grid[0][c] = c % 2 === 0 ? 1 : 0;
  for (let r = 0; r < size; r++) grid[r][size - 1] = r % 2 === 0 ? 1 : 0;
  // Interior data fill seeded by the decoded text.
  fillInterior(grid, size, 1, size - 1, 1, size - 1, seedFrom(text));

  return { kind: 'datamatrix', gridSize: size, moduleGrid: grid, decodedText: text, version: 1 };
}

function buildAztec(text: string, detected: AztecDetected | null): AztecVizData {
  if (detected) {
    return {
      kind: 'aztec',
      gridSize: detected.grid.length,
      moduleGrid: detected.grid,
      decodedText: text,
      version: 1,
      compact: detected.compact,
      nbLayers: detected.nbLayers,
      nbDataBlocks: detected.nbDataBlocks,
    };
  }

  // Fallback: concentric bullseye + mode ring + seeded data layers.
  const size = 15;
  const center = 7;
  const grid = blankGrid(size);
  let state = seedFrom(text);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ring = Math.max(Math.abs(r - center), Math.abs(c - center));
      if (ring <= 2) {
        grid[r][c] = ring % 2 === 0 ? 1 : 0; // bullseye
      } else if (ring === 3) {
        grid[r][c] = (r + c) % 3 === 0 ? 1 : 0; // mode ring
      } else {
        state = nextLfsr(state);
        grid[r][c] = state & 1; // data layers
      }
    }
  }

  return { kind: 'aztec', gridSize: size, moduleGrid: grid, decodedText: text, version: 1 };
}

// --------------------------------------------------------------------------
// Small grid helpers
// --------------------------------------------------------------------------

function blankGrid(size: number): Uint8Array[] {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

function fillInterior(
  grid: Uint8Array[],
  _size: number,
  r0: number,
  r1: number,
  c0: number,
  c1: number,
  seed: number,
): void {
  let state = seed;
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      state = nextLfsr(state);
      grid[r][c] = state & 1;
    }
  }
}

// 16-bit Galois LFSR — same generator the demo grids use, so re-rendered
// grids have the identical "texture", just seeded per decoded message.
function nextLfsr(state: number): number {
  return ((state >> 1) ^ (-(state & 1) & 0xb400)) & 0xffff;
}

function seedFrom(text: string): number {
  let h = 0xace1;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) & 0xffff;
  }
  return h === 0 ? 0xbeef : h;
}
