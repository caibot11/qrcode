import { DEMO_QR } from './codes/qr/qr-demo.js';
import { annotateText } from './core/text-annotator.js';
import { GLOSSARY, getTermsForCodeType } from './core/glossary.js';
import { openComparePanel } from './core/compare-panel.js';

// ---- Code Type Registry ----
// Each entry: { configModule, delegateModule, demoModule }
const CODE_TYPES = {
  qr: {
    configPath: './codes/qr/qr-config.js',
    delegatePath: './codes/qr/qr-visualizer.js',
    demoPath: './codes/qr/qr-demo.js',
    configExport: 'QR_CONFIG',
    delegateExport: 'qrDelegate',
    demoExport: 'DEMO_QR'
  },
  barcode: {
    configPath: './codes/barcode/barcode-config.js',
    delegatePath: './codes/barcode/barcode-visualizer.js',
    demoPath: './codes/barcode/barcode-demo.js',
    configExport: 'BARCODE_CONFIG',
    delegateExport: 'barcodeDelegate',
    demoExport: 'DEMO_BARCODE'
  },
  datamatrix: {
    configPath: './codes/datamatrix/dm-config.js',
    delegatePath: './codes/datamatrix/dm-visualizer.js',
    demoPath: './codes/datamatrix/dm-demo.js',
    configExport: 'DM_CONFIG',
    delegateExport: 'dmDelegate',
    demoExport: 'DEMO_DM'
  },
  aztec: {
    configPath: './codes/aztec/aztec-config.js',
    delegatePath: './codes/aztec/aztec-visualizer.js',
    demoPath: './codes/aztec/aztec-demo.js',
    configExport: 'AZTEC_CONFIG',
    delegateExport: 'aztecDelegate',
    demoExport: 'DEMO_AZTEC'
  }
};

// ---- DOM elements ----
const vizContainer = document.getElementById('viz-container');
const stepProgress = document.getElementById('step-progress');
const stepTitle = document.getElementById('step-title');
const stepDescription = document.getElementById('step-description');
const stageDot = document.getElementById('stage-dot');
const stageLabel = document.getElementById('stage-label');
const detailText = document.getElementById('detail-text');
const cardLiveData = document.getElementById('card-live-data');
const btnPrev = document.getElementById('btn-prev-step');
const btnNext = document.getElementById('btn-next-step');
const btnAutoPlay = document.getElementById('btn-auto-play');
const decodedResult = document.getElementById('decoded-result');
const resultText = document.getElementById('result-text');
const btnScanOwn = document.getElementById('btn-scan-own');
const cameraModal = document.getElementById('camera-modal');
const video = document.getElementById('camera-feed');
const cameraCanvas = document.getElementById('camera-canvas');
const scanOverlay = document.getElementById('scan-overlay');
const btnUpload = document.getElementById('btn-upload');
const btnCloseModal = document.getElementById('btn-close-modal');
const fileInput = document.getElementById('file-input');
const cameraStatus = document.getElementById('camera-status');
const codeTypeSelector = document.getElementById('code-type-selector');
const btnGlossary = document.getElementById('btn-glossary');
const btnCompare = document.getElementById('btn-compare');
const glossaryPanel = document.getElementById('glossary-panel');
const glossaryList = document.getElementById('glossary-list');
const btnCloseGlossary = document.getElementById('btn-close-glossary');
const glossaryTooltip = document.getElementById('glossary-tooltip');
const tooltipText = document.getElementById('tooltip-text');

// ---- State ----
let visualizer = null; // BaseVisualizer instance
let currentConfig = null;
let currentCodeType = 'qr';
let stream = null;
let scanning = false;
let animFrameId = null;

// ---- Initialize ----

async function loadCodeType(type) {
  const reg = CODE_TYPES[type];
  if (!reg) return;

  const [configMod, delegateMod, demoMod] = await Promise.all([
    import(reg.configPath),
    import(reg.delegatePath),
    import(reg.demoPath)
  ]);

  const config = configMod[reg.configExport];
  const delegate = delegateMod[reg.delegateExport];
  const demoData = demoMod[reg.demoExport];

  // For grid-based codes without preset camera, compute from gridSize
  if (!config.cameraPresets || !config.cameraPresets.default) {
    const dist = demoData.gridSize * 1.1;
    config.cameraPresets = {
      default: { pos: [dist * 0.7, dist * 0.9, dist * 0.7], target: [0, 0, 0] }
    };
  }

  return { config, delegate, demoData };
}

async function initVisualizer(type) {
  currentCodeType = type;
  const loaded = await loadCodeType(type);
  if (!loaded) return;

  const { config, delegate, demoData } = loaded;
  currentConfig = config;

  const { BaseVisualizer } = await import('./core/base-visualizer.js');

  if (visualizer) {
    visualizer.destroy();
    visualizer = null;
  }

  // Clear viz container children
  while (vizContainer.firstChild) {
    vizContainer.removeChild(vizContainer.firstChild);
  }

  visualizer = new BaseVisualizer(vizContainer, demoData, config, delegate, {
    onStepChange: updateStepUI,
    onStageData: handleStageData
  });

  visualizer.autoPlay = true;
  btnAutoPlay.textContent = 'Pause';
  btnAutoPlay.classList.remove('paused');

  decodedResult.hidden = false;
  resultText.textContent = demoData.decodedText;

  // Rebuild step dots for this config
  rebuildStepDots(config);

  // Show/hide scan button (QR only)
  btnScanOwn.style.display = type === 'qr' ? '' : 'none';

  visualizer.goToStep(0);
}

function rebuildStepDots(config) {
  stepProgress.innerHTML = '';
  const colors = config.stageColors;
  config.stageLabels.forEach((label, i) => {
    const dot = document.createElement('div');
    // Use config colors for dots
    const color = colors[i] || '#8b949e';
    dot.className = 'step-dot';
    dot.style.color = color;
    dot.style.borderColor = color;
    dot.innerHTML = `<span class="step-dot-label">${label}</span>`;
    dot.addEventListener('click', () => {
      if (visualizer) {
        visualizer.lastInteraction = performance.now();
        visualizer.goToStep(i);
      }
    });
    stepProgress.appendChild(dot);
  });
}

// ---- Step Navigation ----

function updateStepUI(stepIndex) {
  if (stepIndex === undefined && visualizer) stepIndex = visualizer.currentStep;
  if (stepIndex === undefined || stepIndex < 0) return;
  if (!currentConfig) return;

  const config = currentConfig;
  const colors = config.stageColors;
  const maxStep = config.stageCount - 1;

  // Update progress dots
  const dots = stepProgress.querySelectorAll('.step-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === stepIndex);
    dot.classList.toggle('completed', i < stepIndex);
  });

  // Update stage indicator
  const color = colors[stepIndex] || '#8b949e';
  stageDot.style.background = color;
  stageDot.style.boxShadow = `0 0 8px ${color}`;
  stageLabel.textContent = `Stage ${stepIndex + 1} of ${config.stageCount}`;

  // Update title + description with annotated text
  const info = config.stageInfo[stepIndex];
  if (info) {
    stepTitle.textContent = info.title;
    stepTitle.style.color = color;
    stepDescription.innerHTML = annotateText(info.description);
    detailText.innerHTML = annotateText(info.detail || '');
  }

  // Clear live data
  cardLiveData.innerHTML = '';
  setInitialStageContent(stepIndex);

  // Nav buttons
  btnPrev.disabled = stepIndex === 0;
  btnNext.disabled = stepIndex === maxStep;
  btnNext.textContent = stepIndex === maxStep ? 'Done' : 'Next';

  // Re-attach tooltip listeners for new annotated text
  attachTooltipListeners();
}

function setInitialStageContent(stepIndex) {
  if (!currentConfig) return;
  const type = currentConfig.id;

  // Generic stage content templates
  if (type === 'qr') {
    setQRStageContent(stepIndex);
  } else if (type === 'barcode') {
    setBarcodeStageContent(stepIndex);
  } else {
    // Data Matrix & Aztec share similar structure
    setGenericStageContent(stepIndex);
  }
}

function setQRStageContent(stepIndex) {
  switch (stepIndex) {
    case 0:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>QR Structure</h4>
          <div class="format-info-item"><span class="label">Grid Size</span><span class="value">Loading...</span></div>
          <div class="format-info-item"><span class="label">Finder Patterns</span><span class="value">3 corners</span></div>
          <div class="format-info-item"><span class="label">Timing Strips</span><span class="value">Horizontal + Vertical</span></div>
        </div>`;
      break;
    case 1:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Format Info</h4>
          <div class="format-info-item"><span class="label">EC Level</span><span class="value">--</span></div>
          <div class="format-info-item"><span class="label">Mask Pattern</span><span class="value">--</span></div>
          <div class="format-info-item"><span class="label">Mask Formula</span><span class="value">--</span></div>
          <div class="format-info-item"><span class="label">XOR Mask</span><span class="value">0x5412</span></div>
        </div>`;
      break;
    case 2:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Data Reading Progress</h4>
          <div class="live-module-count">Modules read: <strong>0</strong> / --</div>
        </div>
        <div class="live-data-section">
          <h4>Bitstream</h4>
          <div class="live-bitstream">Waiting...</div>
        </div>`;
      break;
    case 3:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Error Correction</h4>
          <div class="ec-stat"><span class="label">Data Bytes</span><span class="value data-color">--</span></div>
          <div class="ec-stat"><span class="label">EC Bytes</span><span class="value ec-color">--</span></div>
          <div class="ec-stat"><span class="label">Damaged</span><span class="value ec-color">0</span></div>
          <div class="ec-stat"><span class="label">Repaired</span><span class="value success-color">0</span></div>
        </div>`;
      break;
    case 4:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Decode Table</h4>
          <table class="decode-table">
            <thead><tr><th>Bits</th><th></th><th>Hex</th><th></th><th>Char</th></tr></thead>
            <tbody id="decode-tbody"></tbody>
          </table>
          <div class="decode-result-row" id="decode-result-text" style="display:none"></div>
        </div>`;
      break;
  }
}

function setBarcodeStageContent(stepIndex) {
  switch (stepIndex) {
    case 0:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Barcode Structure</h4>
          <div class="format-info-item"><span class="label">Type</span><span class="value">Code 128B</span></div>
          <div class="format-info-item"><span class="label">Total Bars</span><span class="value">--</span></div>
          <div class="format-info-item"><span class="label">Characters</span><span class="value">--</span></div>
        </div>`;
      break;
    case 1:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Width Encoding</h4>
          <div class="format-info-item"><span class="label">Current Group</span><span class="value">--</span></div>
          <div class="format-info-item"><span class="label">Character</span><span class="value">--</span></div>
        </div>`;
      break;
    case 2:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Scanner Progress</h4>
          <div class="live-module-count">Bars scanned: <strong>0</strong> / --</div>
        </div>`;
      break;
    case 3:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Check Digit Verification</h4>
          <div class="ec-stat"><span class="label">Check Value</span><span class="value data-color">--</span></div>
          <div class="ec-stat"><span class="label">Formula</span><span class="value">Sum(val*pos) mod 103</span></div>
          <div class="ec-stat"><span class="label">Status</span><span class="value success-color">--</span></div>
        </div>`;
      break;
    case 4:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Decode Table</h4>
          <table class="decode-table">
            <thead><tr><th>Bits</th><th></th><th>Hex</th><th></th><th>Char</th></tr></thead>
            <tbody id="decode-tbody"></tbody>
          </table>
          <div class="decode-result-row" id="decode-result-text" style="display:none"></div>
        </div>`;
      break;
  }
}

function setGenericStageContent(stepIndex) {
  const typeName = currentConfig?.name || 'Code';
  switch (stepIndex) {
    case 0:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>${typeName} Structure</h4>
          <div class="format-info-item"><span class="label">Grid Size</span><span class="value">Loading...</span></div>
          <div class="format-info-item"><span class="label">Finder Type</span><span class="value">--</span></div>
        </div>`;
      break;
    case 1:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Pattern Info</h4>
          <div class="format-info-item"><span class="label">Pattern</span><span class="value">--</span></div>
        </div>`;
      break;
    case 2:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Data Reading</h4>
          <div class="live-module-count">Modules read: <strong>0</strong> / --</div>
        </div>`;
      break;
    case 3:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Error Correction</h4>
          <div class="ec-stat"><span class="label">Data Bytes</span><span class="value data-color">--</span></div>
          <div class="ec-stat"><span class="label">EC Bytes</span><span class="value ec-color">--</span></div>
        </div>`;
      break;
    case 4:
      cardLiveData.innerHTML = `
        <div class="live-data-section">
          <h4>Decode Table</h4>
          <table class="decode-table">
            <thead><tr><th>Bits</th><th></th><th>Hex</th><th></th><th>Char</th></tr></thead>
            <tbody id="decode-tbody"></tbody>
          </table>
          <div class="decode-result-row" id="decode-result-text" style="display:none"></div>
        </div>`;
      break;
  }
}

// ---- Handle Live Stage Data from Visualizer ----

function handleStageData({ type, payload }) {
  switch (type) {
    case 'structure': {
      const items = cardLiveData.querySelectorAll('.format-info-item .value');
      if (payload.gridSize && items[0]) items[0].textContent = `${payload.gridSize} x ${payload.gridSize}`;
      if (payload.finderType && items[1]) items[1].textContent = payload.finderType;
      if (payload.type && items[1]) items[1].textContent = payload.type;
      // QR-specific
      if (payload.version && items[0]) items[0].textContent = `${payload.gridSize} x ${payload.gridSize} (v${payload.version})`;
      // Barcode-specific
      if (payload.totalBars !== undefined && items[1]) items[1].textContent = payload.totalBars;
      if (payload.characters !== undefined && items[2]) items[2].textContent = payload.characters;
      break;
    }
    case 'format': {
      const items = cardLiveData.querySelectorAll('.format-info-item .value');
      if (items[0]) items[0].textContent = payload.ecLevel;
      if (items[1]) items[1].textContent = `#${payload.maskPattern}`;
      if (items[2]) items[2].textContent = payload.maskFormula;
      break;
    }
    case 'encoding': {
      const items = cardLiveData.querySelectorAll('.format-info-item .value');
      if (items[0]) items[0].textContent = `${payload.currentGroup + 1} / ${payload.totalGroups}`;
      if (items[1]) items[1].textContent = payload.currentChar || '--';
      break;
    }
    case 'clockTrack':
    case 'modeMessage': {
      const items = cardLiveData.querySelectorAll('.format-info-item .value');
      if (payload.pattern && items[0]) items[0].textContent = payload.pattern;
      if (payload.ringBits && items[0]) items[0].textContent = `${payload.ringBits} bits`;
      break;
    }
    case 'dataReading': {
      const countEl = cardLiveData.querySelector('.live-module-count');
      if (countEl) {
        countEl.innerHTML = `Modules read: <strong>${payload.revealed}</strong> / ${payload.total}`;
      }
      const bitsEl = cardLiveData.querySelector('.live-bitstream');
      if (bitsEl && payload.bitstream) {
        bitsEl.textContent = payload.bitstream;
      }
      break;
    }
    case 'scanning': {
      const countEl = cardLiveData.querySelector('.live-module-count');
      if (countEl) {
        countEl.innerHTML = `Bars scanned: <strong>${payload.barsRead}</strong> / ${payload.totalBars}`;
      }
      break;
    }
    case 'errorCorrection': {
      const values = cardLiveData.querySelectorAll('.ec-stat .value');
      if (values[0]) values[0].textContent = payload.dataBytes;
      if (values[1]) values[1].textContent = payload.ecBytes;
      if (values[2]) values[2].textContent = payload.damaged;
      if (values[3]) values[3].textContent = payload.repaired;
      break;
    }
    case 'checkDigit': {
      const values = cardLiveData.querySelectorAll('.ec-stat .value');
      if (values[0]) values[0].textContent = payload.checkValue;
      if (values[2]) values[2].textContent = payload.verified ? 'PASS' : 'Calculating...';
      break;
    }
    case 'decode': {
      const tbody = document.getElementById('decode-tbody');
      if (tbody) {
        let html = '';
        for (const entry of payload.table) {
          html += `<tr>
            <td class="col-bits">${entry.binary}</td>
            <td class="col-arrow">&rarr;</td>
            <td class="col-hex">${entry.hex}</td>
            <td class="col-arrow">&rarr;</td>
            <td class="col-char">${escapeHtml(entry.char)}</td>
          </tr>`;
        }
        tbody.innerHTML = html;
      }
      const resultRow = document.getElementById('decode-result-text');
      if (resultRow && payload.fullText) {
        resultRow.style.display = 'block';
        resultRow.textContent = `Result: ${payload.fullText}`;
      }
      break;
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Code Type Selector ----

codeTypeSelector.addEventListener('click', (e) => {
  const btn = e.target.closest('.code-type-btn');
  if (!btn) return;
  const type = btn.dataset.type;
  if (type === currentCodeType) return;

  // Update active state
  codeTypeSelector.querySelectorAll('.code-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  initVisualizer(type);
});

// ---- Navigation Buttons ----

btnPrev.addEventListener('click', () => {
  if (visualizer && visualizer.currentStep > 0) {
    visualizer.lastInteraction = performance.now();
    visualizer.goToStep(visualizer.currentStep - 1);
  }
});

btnNext.addEventListener('click', () => {
  const maxStep = currentConfig ? currentConfig.stageCount - 1 : 4;
  if (visualizer && visualizer.currentStep < maxStep) {
    visualizer.lastInteraction = performance.now();
    visualizer.goToStep(visualizer.currentStep + 1);
  }
});

btnAutoPlay.addEventListener('click', () => {
  if (!visualizer) return;
  visualizer.lastInteraction = performance.now();
  visualizer.autoPlay = !visualizer.autoPlay;
  btnAutoPlay.textContent = visualizer.autoPlay ? 'Pause' : 'Auto Play';
  btnAutoPlay.classList.toggle('paused', !visualizer.autoPlay);

  if (visualizer.autoPlay && !visualizer.isAnimating) {
    const maxStep = currentConfig ? currentConfig.stageCount - 1 : 4;
    if (visualizer.currentStep < maxStep) {
      visualizer.goToStep(visualizer.currentStep + 1);
    } else {
      visualizer.goToStep(0);
    }
  }
});

// ---- Glossary Tooltip System ----

function attachTooltipListeners() {
  // Attach to all glossary terms in the info card
  document.querySelectorAll('#info-card .glossary-term').forEach(el => {
    el.addEventListener('mouseover', showTooltip);
    el.addEventListener('mouseout', hideTooltip);
    el.addEventListener('touchstart', showTooltip, { passive: true });
  });
}

function showTooltip(e) {
  const term = e.target.dataset.term;
  if (!term || !GLOSSARY[term]) return;

  tooltipText.textContent = GLOSSARY[term].short;
  glossaryTooltip.hidden = false;

  // Position near the term
  const rect = e.target.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left;

  // Keep in viewport
  if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
  if (top + 100 > window.innerHeight) top = rect.top - 80;
  if (left < 5) left = 5;

  glossaryTooltip.style.top = `${top}px`;
  glossaryTooltip.style.left = `${left}px`;
}

function hideTooltip() {
  glossaryTooltip.hidden = true;
}

// Hide tooltip on any outside touch
document.addEventListener('touchstart', (e) => {
  if (!e.target.closest('.glossary-term')) {
    hideTooltip();
  }
}, { passive: true });

// ---- Glossary Panel ----

btnGlossary.addEventListener('click', () => {
  populateGlossaryPanel();
  glossaryPanel.hidden = false;
});

btnCloseGlossary.addEventListener('click', () => {
  glossaryPanel.hidden = true;
});

function populateGlossaryPanel() {
  const terms = getTermsForCodeType(currentCodeType);
  const sortedKeys = Object.keys(terms).sort();
  let html = '';

  for (const key of sortedKeys) {
    const t = terms[key];
    html += `
      <div class="glossary-entry" data-term="${escapeHtml(key)}">
        <div class="glossary-entry-term">${escapeHtml(key)}</div>
        <div class="glossary-entry-short">${escapeHtml(t.short)}</div>
        <div class="glossary-entry-long">${escapeHtml(t.long)}</div>
        <button class="glossary-entry-toggle">Show more</button>
      </div>`;
  }

  glossaryList.innerHTML = html;

  // Toggle expand/collapse
  glossaryList.querySelectorAll('.glossary-entry-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = btn.closest('.glossary-entry');
      const expanded = entry.classList.toggle('expanded');
      btn.textContent = expanded ? 'Show less' : 'Show more';
    });
  });
}

// ---- Compare Panel ----

btnCompare.addEventListener('click', () => {
  openComparePanel();
});

// ---- "Scan Your Own QR" Modal ----

btnScanOwn.addEventListener('click', openCameraModal);
btnCloseModal.addEventListener('click', closeCameraModal);

async function openCameraModal() {
  cameraModal.hidden = false;
  cameraStatus.textContent = 'Starting camera...';

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = resolve; });
    video.play();

    video.hidden = false;
    cameraCanvas.hidden = true;
    scanOverlay.hidden = false;
    cameraStatus.textContent = 'Scanning for QR code...';
    startScanning();
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      cameraStatus.textContent = 'Camera permission denied. Try uploading an image instead.';
    } else {
      cameraStatus.textContent = 'Camera not available. Try uploading an image.';
    }
    console.error('Camera error:', err);
  }
}

function closeCameraModal() {
  scanning = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  scanOverlay.hidden = true;
  cameraModal.hidden = true;
}

// ---- QR Scanning Loop ----

function startScanning() {
  scanning = true;
  const cameraCtx = cameraCanvas.getContext('2d', { willReadFrequently: true });
  cameraCanvas.width = video.videoWidth;
  cameraCanvas.height = video.videoHeight;

  function scanFrame() {
    if (!scanning) return;

    cameraCtx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    const imageData = cameraCtx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (qrResult && qrResult.data) {
      onQRDetected(qrResult, imageData);
    } else {
      animFrameId = requestAnimationFrame(scanFrame);
    }
  }
  scanFrame();
}

// ---- Grid Extraction ----

function extractModuleGrid(imageData, location, version) {
  const size = 4 * version + 17;
  const grid = Array.from({ length: size }, () => new Uint8Array(size));
  const { topLeftCorner, topRightCorner, bottomLeftCorner } = location;
  const w = imageData.width, h = imageData.height, data = imageData.data;

  // jsQR v1.4 corners map to the outer boundary of the QR grid:
  // topLeftCorner = pixel at module coord (col=0, row=0) edge
  // topRightCorner = pixel at (col=dimension, row=0) edge
  // bottomLeftCorner = pixel at (col=0, row=dimension) edge
  const bottomRightCorner = location.bottomRightCorner || {
    x: topRightCorner.x + bottomLeftCorner.x - topLeftCorner.x,
    y: topRightCorner.y + bottomLeftCorner.y - topLeftCorner.y
  };

  // Helper: sample brightness at a pixel, clamped to image bounds
  function sampleBrightness(px, py) {
    const cx = Math.max(0, Math.min(w - 1, Math.round(px)));
    const cy = Math.max(0, Math.min(h - 1, Math.round(py)));
    const idx = (cy * w + cx) * 4;
    return (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  }

  // Compute module size in pixels to determine sampling radius
  const modulePxW = Math.sqrt(
    Math.pow(topRightCorner.x - topLeftCorner.x, 2) +
    Math.pow(topRightCorner.y - topLeftCorner.y, 2)
  ) / size;
  const modulePxH = Math.sqrt(
    Math.pow(bottomLeftCorner.x - topLeftCorner.x, 2) +
    Math.pow(bottomLeftCorner.y - topLeftCorner.y, 2)
  ) / size;
  const modulePx = Math.min(modulePxW, modulePxH);
  // Sample radius: fraction of module size, at least 1px
  const sampleR = Math.max(1, Math.floor(modulePx * 0.25));

  // First pass: collect brightness values to compute adaptive threshold
  const brightnessValues = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Module center in [0,1] space
      const u = (col + 0.5) / size;
      const v = (row + 0.5) / size;

      // Bilinear interpolation to get pixel position
      const px = (1 - u) * (1 - v) * topLeftCorner.x + u * (1 - v) * topRightCorner.x +
                 (1 - u) * v * bottomLeftCorner.x + u * v * bottomRightCorner.x;
      const py = (1 - u) * (1 - v) * topLeftCorner.y + u * (1 - v) * topRightCorner.y +
                 (1 - u) * v * bottomLeftCorner.y + u * v * bottomRightCorner.y;

      // Multi-pixel sampling: average a small area around center
      let totalBrightness = 0;
      let sampleCount = 0;
      for (let dy = -sampleR; dy <= sampleR; dy++) {
        for (let dx = -sampleR; dx <= sampleR; dx++) {
          totalBrightness += sampleBrightness(px + dx, py + dy);
          sampleCount++;
        }
      }
      const avgBrightness = totalBrightness / sampleCount;
      brightnessValues.push(avgBrightness);
    }
  }

  // Adaptive threshold: use Otsu's method
  const threshold = otsuThreshold(brightnessValues);

  // Second pass: apply threshold
  for (let i = 0; i < brightnessValues.length; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    grid[row][col] = brightnessValues[i] < threshold ? 1 : 0;
  }

  return grid;
}

function otsuThreshold(values) {
  // Build histogram (256 bins)
  const hist = new Float64Array(256);
  for (const v of values) hist[Math.max(0, Math.min(255, Math.round(v)))]++;
  const total = values.length;

  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumBg = 0, wBg = 0, bestThresh = 128, bestVariance = 0;
  for (let t = 0; t < 256; t++) {
    wBg += hist[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / wBg;
    const meanFg = (sumAll - sumBg) / wFg;
    const variance = wBg * wFg * Math.pow(meanBg - meanFg, 2);
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThresh = t;
    }
  }
  return bestThresh;
}

function readFormatInfo(grid) {
  const formatBitPositions = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];

  let formatBits = 0;
  for (let i = 0; i < 15; i++) {
    const [row, col] = formatBitPositions[i];
    if (grid[row] && grid[row][col]) {
      formatBits |= (1 << (14 - i));
    }
  }

  formatBits ^= 0x5412;

  const ecLevel = (formatBits >> 13) & 0x03;
  const maskPattern = (formatBits >> 10) & 0x07;
  const ecLabels = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

  return {
    raw: formatBits,
    errorCorrectionLevel: ecLabels[ecLevel] || 'M',
    maskPattern: maskPattern,
    ecLevel: ecLevel,
    formatBitPositions: formatBitPositions
  };
}

// ---- On QR Detected ----

function onQRDetected(qrResult, imageData) {
  scanning = false;
  if (animFrameId) cancelAnimationFrame(animFrameId);

  const version = qrResult.version || 1;
  const moduleGrid = extractModuleGrid(imageData, qrResult.location, version);
  const formatInfo = readFormatInfo(moduleGrid);

  const vizData = {
    imageData: imageData,
    location: qrResult.location,
    decodedText: qrResult.data,
    version: version,
    moduleGrid: moduleGrid,
    gridSize: 4 * version + 17,
    formatInfo: formatInfo,
    chunks: qrResult.chunks || [],
    binaryData: qrResult.binaryData || []
  };

  closeCameraModal();

  // Make sure we're on QR tab
  if (currentCodeType !== 'qr') {
    codeTypeSelector.querySelectorAll('.code-type-btn').forEach(b => b.classList.remove('active'));
    codeTypeSelector.querySelector('[data-type="qr"]').classList.add('active');
  }

  // Load the new QR
  if (visualizer && currentCodeType === 'qr') {
    visualizer.loadNewCode(vizData);
    resultText.textContent = vizData.decodedText;
    decodedResult.hidden = false;
  } else {
    initVisualizer('qr').then(() => {
      if (visualizer) {
        visualizer.loadNewCode(vizData);
        resultText.textContent = vizData.decodedText;
        decodedResult.hidden = false;
      }
    });
  }
}

// ---- File Upload ----

btnUpload.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (qrResult && qrResult.data) {
      onQRDetected(qrResult, imageData);
    } else {
      cameraStatus.textContent = 'No QR code found in the image. Try another.';
    }
  };
  img.src = URL.createObjectURL(file);
  fileInput.value = '';
});

// ---- Auto-start with QR Demo ----

initVisualizer('qr');
