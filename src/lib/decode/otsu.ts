/**
 * Otsu's method for finding the optimal binarization threshold.
 * Ported from legacy/app.js `otsuThreshold`.
 *
 * @param values brightness values in [0..255]
 * @returns threshold in [0..255]
 */
export function otsuThreshold(values: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const bin = Math.max(0, Math.min(255, Math.round(v)));
    hist[bin]++;
  }
  const total = values.length;

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumBg = 0;
  let wBg = 0;
  let bestThresh = 128;
  let bestVariance = 0;

  for (let t = 0; t < 256; t++) {
    wBg += hist[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;

    sumBg += t * hist[t];
    const meanBg = sumBg / wBg;
    const meanFg = (sumAll - sumBg) / wFg;
    const variance = wBg * wFg * (meanBg - meanFg) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      bestThresh = t;
    }
  }

  return bestThresh;
}
