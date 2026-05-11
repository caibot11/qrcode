// Re-export shim for backward compatibility
// The Visualizer3D class is now composed via BaseVisualizer + qrDelegate
import { BaseVisualizer } from './core/base-visualizer.js';
import { qrDelegate } from './codes/qr/qr-visualizer.js';
import { QR_CONFIG } from './codes/qr/qr-config.js';

export class Visualizer3D {
  constructor(container, vizData, callbacks = {}) {
    // Compute camera preset from grid size
    const config = { ...QR_CONFIG };
    const dist = vizData.gridSize * 1.1;
    config.cameraPresets = {
      default: { pos: [dist * 0.7, dist * 0.9, dist * 0.7], target: [0, 0, 0] }
    };

    this._base = new BaseVisualizer(container, vizData, config, qrDelegate, callbacks);

    // Proxy public API
    this.autoPlay = false;
    this.currentStep = -1;
    this.lastInteraction = performance.now();
    this.isAnimating = false;
  }

  get autoPlay() { return this._base.autoPlay; }
  set autoPlay(v) { this._base.autoPlay = v; }
  get currentStep() { return this._base.currentStep; }
  set currentStep(v) { /* managed by base */ }
  get lastInteraction() { return this._base.lastInteraction; }
  set lastInteraction(v) { this._base.lastInteraction = v; }
  get isAnimating() { return this._base.isAnimating; }
  set isAnimating(v) { /* managed by base */ }

  goToStep(i) { this._base.goToStep(i); }
  loadNewQR(vizData) { this._base.loadNewCode(vizData); }
  destroy() { this._base.destroy(); }
}

Visualizer3D.STAGE_INFO = QR_CONFIG.stageInfo;
