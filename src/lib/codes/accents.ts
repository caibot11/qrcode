import type { CodeKind } from './types';
import { hexToRgbNorm } from './qr/helpers';

/**
 * Per-code-type accent palette. Must stay in sync with the CSS overrides in
 * `src/styles/tokens.css` (which drive the UI chrome). The 3D scenes read
 * these RGBs directly because three.js can't see CSS variables.
 */
export const ACCENT_HEX: Record<CodeKind, string> = {
  qr: '#5aa9ff',
  barcode: '#5dd39e',
  datamatrix: '#f5b04d',
  aztec: '#f476c8',
};

export const ACCENT_STRONG_HEX: Record<CodeKind, string> = {
  qr: '#94c7ff',
  barcode: '#8fe5bb',
  datamatrix: '#ffcb7a',
  aztec: '#ffa1d7',
};

/** Warm safety/warn color used to distinguish error-correction modules from data. */
export const WARN_HEX = '#f5b04d';

/** Cream — used for "already decoded" / neutral hot-state text. */
export const CREAM_HEX = '#fff6e0';

export const ACCENT_RGB: Record<CodeKind, { r: number; g: number; b: number }> = {
  qr: hexToRgbNorm(ACCENT_HEX.qr),
  barcode: hexToRgbNorm(ACCENT_HEX.barcode),
  datamatrix: hexToRgbNorm(ACCENT_HEX.datamatrix),
  aztec: hexToRgbNorm(ACCENT_HEX.aztec),
};

export const ACCENT_STRONG_RGB: Record<
  CodeKind,
  { r: number; g: number; b: number }
> = {
  qr: hexToRgbNorm(ACCENT_STRONG_HEX.qr),
  barcode: hexToRgbNorm(ACCENT_STRONG_HEX.barcode),
  datamatrix: hexToRgbNorm(ACCENT_STRONG_HEX.datamatrix),
  aztec: hexToRgbNorm(ACCENT_STRONG_HEX.aztec),
};

export const WARN_RGB = hexToRgbNorm(WARN_HEX);
export const CREAM_RGB = hexToRgbNorm(CREAM_HEX);
