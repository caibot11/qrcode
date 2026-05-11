// ---- Step metadata ----
const STEP_INFO = [
  {
    title: 'Step 1: Detection',
    description: 'Finding the three finder patterns — the large squares in the corners that help scanners locate the QR code.'
  },
  {
    title: 'Step 2: Alignment & Timing',
    description: 'The timing patterns (alternating modules in row 6 and column 6) establish the grid spacing for all modules.'
  },
  {
    title: 'Step 3: Format Information',
    description: 'Reading the 15-bit format string to determine the error correction level and which mask pattern was applied.'
  },
  {
    title: 'Step 4: Mask Removal',
    description: 'XOR-ing the mask pattern off the data modules to reveal the actual encoded data underneath.'
  },
  {
    title: 'Step 5: Data Reading',
    description: 'Reading modules in a zig-zag pattern from bottom-right, assembling black (1) and white (0) into a bitstream.'
  },
  {
    title: 'Step 6: Error Correction',
    description: 'Reed-Solomon error correction validates and repairs corrupted data using parity bytes.'
  },
  {
    title: 'Step 7: Decoding',
    description: 'Converting the bitstream into characters — mode indicator, character count, then the actual data bytes.'
  }
];

const STEP_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#ff6b6b', '#1abc9c'];

// Calculate step durations dynamically based on QR code size
function calculateStepDurations(gridSize) {
  // Base durations for Version 1 QR (21x21 modules)
  const baseDurations = [3000, 2500, 4000, 4000, 5000, 3500, 4500];

  // Scale factor based on grid size
  // Version 1: 21 modules (factor = 1.0)
  // Version 6: 41 modules (factor = 1.95)
  // Version 40: 177 modules (factor = 8.43)
  const scaleFactor = Math.sqrt(gridSize / 21);  // Square root for gentler scaling

  // Apply scaling to each step
  return baseDurations.map(dur => Math.floor(dur * scaleFactor));
}

// ---- Helpers ----

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Build a map of reserved (non-data) modules
function buildReservedMap(size, version) {
  const reserved = Array.from({ length: size }, () => new Uint8Array(size));

  // Finder patterns + separators (3 corners, 7x7 + 1 separator)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r < size && c < size) reserved[r][c] = 1; // top-left
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = size - 8; c < size; c++) {
      if (r < size && c >= 0) reserved[r][c] = 1; // top-right
    }
  }
  for (let r = size - 8; r < size; r++) {
    for (let c = 0; c < 9; c++) {
      if (r >= 0 && c < size) reserved[r][c] = 1; // bottom-left
    }
  }

  // Timing patterns
  for (let i = 0; i < size; i++) {
    reserved[6][i] = 1;
    reserved[i][6] = 1;
  }

  // Alignment patterns (version 2+)
  if (version >= 2) {
    const positions = getAlignmentPositions(version);
    for (const r of positions) {
      for (const c of positions) {
        // Skip if overlapping with finder patterns
        if (r < 9 && c < 9) continue;
        if (r < 9 && c > size - 9) continue;
        if (r > size - 9 && c < 9) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (r + dr >= 0 && r + dr < size && c + dc >= 0 && c + dc < size) {
              reserved[r + dr][c + dc] = 1;
            }
          }
        }
      }
    }
  }

  // Format info areas
  // Around top-left finder
  for (let i = 0; i < 9; i++) {
    if (i < size) reserved[8][i] = 1;
    if (i < size) reserved[i][8] = 1;
  }
  // Around bottom-left finder
  for (let i = 0; i < 8; i++) {
    if (size - 1 - i >= 0) reserved[size - 1 - i][8] = 1;
  }
  // Around top-right finder
  for (let i = 0; i < 8; i++) {
    if (size - 8 + i < size) reserved[8][size - 8 + i] = 1;
  }

  // Dark module
  if (4 * version + 9 < size) reserved[4 * version + 9][8] = 1;

  // Version info (version 7+)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        reserved[i][size - 11 + j] = 1;
        reserved[size - 11 + j][i] = 1;
      }
    }
  }

  return reserved;
}

function getAlignmentPositions(version) {
  if (version === 1) return [];
  const table = [
    [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
    [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
    [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
    [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
    [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110],
    [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
    [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
    [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138],
    [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
    [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
    [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
    [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
  ];
  return table[version - 1] || [];
}

function computeZigZagOrder(size, version) {
  const reserved = buildReservedMap(size, version);
  const order = [];
  let col = size - 1;
  let upward = true;

  while (col >= 0) {
    if (col === 6) { col--; continue; }

    for (let i = 0; i < size; i++) {
      const row = upward ? (size - 1 - i) : i;

      if (!reserved[row][col]) {
        order.push([row, col]);
      }
      if (col - 1 >= 0 && !reserved[row][col - 1]) {
        order.push([row, col - 1]);
      }
    }
    upward = !upward;
    col -= 2;
  }
  return order;
}

function generateMaskGrid(size, maskPattern) {
  const mask = Array.from({ length: size }, () => new Uint8Array(size));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let condition;
      switch (maskPattern) {
        case 0: condition = (row + col) % 2 === 0; break;
        case 1: condition = row % 2 === 0; break;
        case 2: condition = col % 3 === 0; break;
        case 3: condition = (row + col) % 3 === 0; break;
        case 4: condition = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
        case 5: condition = (row * col) % 2 + (row * col) % 3 === 0; break;
        case 6: condition = ((row * col) % 2 + (row * col) % 3) % 2 === 0; break;
        case 7: condition = ((row + col) % 2 + (row * col) % 3) % 2 === 0; break;
        default: condition = false;
      }
      mask[row][col] = condition ? 1 : 0;
    }
  }
  return mask;
}

function evaluateMaskFormula(maskPattern, row, col) {
  let condition = false;
  switch (maskPattern) {
    case 0: condition = (row + col) % 2 === 0; break;
    case 1: condition = row % 2 === 0; break;
    case 2: condition = col % 3 === 0; break;
    case 3: condition = (row + col) % 3 === 0; break;
    case 4: condition = (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0; break;
    case 5: condition = ((row * col) % 2) + ((row * col) % 3) === 0; break;
    case 6: condition = (((row * col) % 2) + ((row * col) % 3)) % 2 === 0; break;
    case 7: condition = (((row + col) % 2) + ((row * col) % 3)) % 2 === 0; break;
  }
  return condition ? 1 : 0;
}

const MASK_FORMULAS = [
  '(row + col) mod 2 = 0',
  'row mod 2 = 0',
  'col mod 3 = 0',
  '(row + col) mod 3 = 0',
  '(row/2 + col/3) mod 2 = 0',
  '(row*col) mod 2 + (row*col) mod 3 = 0',
  '((row*col) mod 2 + (row*col) mod 3) mod 2 = 0',
  '((row+col) mod 2 + (row*col) mod 3) mod 2 = 0'
];

// ---- Drawing Utilities ----

function drawGrid(ctx, grid, x, y, modSize, colorFn) {
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let fill;
      if (colorFn) {
        fill = colorFn(r, c, grid[r][c]);
      }
      if (!fill) {
        fill = grid[r][c] ? '#e6edf3' : '#1c2028';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x + c * modSize, y + r * modSize, modSize, modSize);
    }
  }
  // Grid lines
  ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * modSize, y);
    ctx.lineTo(x + i * modSize, y + size * modSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + i * modSize);
    ctx.lineTo(x + size * modSize, y + i * modSize);
    ctx.stroke();
  }
}

function drawHighlightRect(ctx, x, y, w, h, color, pulse) {
  ctx.save();
  const alpha = 0.3 + 0.3 * Math.sin(pulse * Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = hexToRgba(color, alpha * 0.3);
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawAnnotation(ctx, text, tx, ty, lx, ly, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(lx, ly);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, lx, ly - 6);
  ctx.restore();
}

function drawAnimatedText(ctx, text, x, y, progress, opts = {}) {
  ctx.save();
  const alpha = Math.min(1, progress * 2);
  const scale = 0.8 + 0.2 * Math.min(1, progress * 1.5);
  ctx.globalAlpha = alpha;
  ctx.font = opts.font || '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = opts.color || '#e6edf3';
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---- Visualizer Class ----

export class Visualizer {
  static STEP_INFO = STEP_INFO;

  constructor(canvas, data, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.currentStep = 0;
    this.stepPhase = 0;
    this.animating = false;
    this.autoPlay = false;
    this.animFrameId = null;
    this.lastTimestamp = 0;
    this.onStepChange = callbacks.onStepChange || (() => {});
    this.destroyed = false;

    // Calculate adaptive step durations
    this.stepDurations = calculateStepDurations(data.gridSize);

    // Precompute shared layout
    this.computeLayout();

    // Precompute expensive data
    this.reserved = buildReservedMap(data.gridSize, data.version);
    this.zigZagOrder = computeZigZagOrder(data.gridSize, data.version);
    this.maskGrid = generateMaskGrid(data.gridSize, data.formatInfo.maskPattern);

    // Compute unmasked grid
    this.unmaskedGrid = data.moduleGrid.map((row, r) =>
      row.map((val, c) => {
        if (this.reserved[r][c]) return val;
        return val ^ this.maskGrid[r][c];
      })
    );
  }

  computeLayout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const gridSize = this.data.gridSize;

    // Grid area: wider spacing for convention display
    const gridAreaW = W * 0.50;  // Reduced from 55%
    const gridAreaH = H * 0.80;  // Reduced from 85%
    const maxModSize = Math.min(gridAreaW / gridSize, gridAreaH / gridSize);
    this.modSize = Math.floor(Math.max(4, maxModSize));  // Min 4px (was 3px)
    const totalGridW = this.modSize * gridSize;
    const totalGridH = this.modSize * gridSize;

    this.gridX = Math.floor((gridAreaW - totalGridW) / 2) + 40;  // 40px margin (was 20px)
    this.gridY = Math.floor((H - totalGridH) / 2) + 30;          // Add 30px top margin

    // Info area: right side with larger gap
    this.infoX = this.gridX + totalGridW + 50;  // 50px gap (was 30px)
    this.infoW = W - this.infoX - 40;           // 40px right margin (was 20px)
    this.infoY = this.gridY;
  }

  goToStep(index) {
    this.currentStep = index;
    this.stepPhase = 0;
    this.onStepChange(index);
    this.startAnimation();
  }

  startAnimation() {
    this.animating = true;
    this.lastTimestamp = performance.now();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
  }

  loop(timestamp) {
    if (this.destroyed) return;
    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const duration = this.stepDurations[this.currentStep];  // Use dynamic duration
    this.stepPhase = Math.min(1, this.stepPhase + dt / duration);

    const p = easeInOutCubic(this.stepPhase);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.renderStep(this.currentStep, p);

    if (this.stepPhase < 1) {
      this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    } else {
      this.animating = false;
      if (this.autoPlay && this.currentStep < 6) {  // Updated to 6 steps
        setTimeout(() => {
          if (!this.destroyed) this.goToStep(this.currentStep + 1);
        }, 800);
      }
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }

  renderStep(step, p) {
    switch (step) {
      case 0: this.renderDetection(p); break;
      case 1: this.renderAlignment(p); break;
      case 2: this.renderFormatInfo(p); break;
      case 3: this.renderMaskRemoval(p); break;
      case 4: this.renderDataReading(p); break;
      case 5: this.renderErrorCorrection(p); break;
      case 6: this.renderDecoding(p); break;
    }
  }

  // =========================================
  // Step 1: Detection
  // =========================================
  renderDetection(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const grid = this.data.moduleGrid;
    const size = this.data.gridSize;
    const color = STEP_COLORS[0];

    // Fade in grid
    const gridAlpha = Math.min(1, p * 5);
    ctx.save();
    ctx.globalAlpha = gridAlpha;

    // Color function: highlight finder patterns
    const finderProgress = Math.max(0, (p - 0.2) / 0.6);

    drawGrid(ctx, grid, gridX, gridY, modSize, (r, c, val) => {
      const inTL = r < 7 && c < 7;
      const inTR = r < 7 && c >= size - 7;
      const inBL = r >= size - 7 && c < 7;

      const fpIdx = inTL ? 0 : inTR ? 1 : inBL ? 2 : -1;
      if (fpIdx >= 0) {
        const fpProgress = Math.max(0, Math.min(1, (finderProgress - fpIdx * 0.33) * 3));
        if (fpProgress > 0 && val) {
          return hexToRgba(color, 0.5 + 0.5 * fpProgress);
        }
        if (fpProgress > 0 && !val) {
          return hexToRgba(color, 0.15 * fpProgress);
        }
      }
      return null;
    });

    ctx.restore();

    // Highlight rectangles around finder patterns
    const patterns = [
      { r: 0, c: 0, label: 'Top-Left\nFinder Pattern', lx: -40, ly: -15 },
      { r: 0, c: size - 7, label: 'Top-Right\nFinder Pattern', lx: 40, ly: -15 },
      { r: size - 7, c: 0, label: 'Bottom-Left\nFinder Pattern', lx: -40, ly: 15 }
    ];

    patterns.forEach((fp, i) => {
      const fpP = Math.max(0, Math.min(1, (finderProgress - i * 0.33) * 3));
      if (fpP <= 0) return;

      const rx = gridX + fp.c * modSize - 2;
      const ry = gridY + fp.r * modSize - 2;
      const rw = 7 * modSize + 4;
      const rh = 7 * modSize + 4;

      ctx.save();
      ctx.globalAlpha = fpP;
      drawHighlightRect(ctx, rx, ry, rw, rh, color, p * 3 + i);

      // Annotation
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      drawAnnotation(ctx, fp.label.split('\n')[0], cx, ry + (fp.ly > 0 ? rh + 2 : -2),
        cx + fp.lx, ry + (fp.ly > 0 ? rh + 22 : -22), color);
      ctx.restore();
    });

    // Info text on the right
    this.drawInfoPanel(ctx, p, 0, [
      { t: 'Finding QR Code', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
      { t: 'Every QR code has three finder', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'patterns — large squares at three', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'corners. Scanners look for these', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'to locate and orient the code.', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: '' },
      { t: `Grid size: ${size} x ${size} modules`, font: '15px "Segoe UI", sans-serif', color: '#e6edf3' },
      { t: `Version: ${this.data.version}`, font: '15px "Segoe UI", sans-serif', color: '#e6edf3' },
    ]);
  }

  // =========================================
  // Step 2: Alignment & Timing
  // =========================================
  renderAlignment(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const grid = this.data.moduleGrid;
    const size = this.data.gridSize;
    const color = STEP_COLORS[1];

    const timingHProgress = Math.min(1, p / 0.35);
    const timingVProgress = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
    const alignProgress = Math.max(0, Math.min(1, (p - 0.6) / 0.4));

    const alignPositions = getAlignmentPositions(this.data.version);

    drawGrid(ctx, grid, gridX, gridY, modSize, (r, c, val) => {
      // Timing pattern row 6
      if (r === 6 && c >= 8 && c < size - 8) {
        const cellP = Math.min(1, timingHProgress * size - (c - 8));
        if (cellP > 0) return hexToRgba(color, 0.3 + 0.7 * cellP);
      }
      // Timing pattern col 6
      if (c === 6 && r >= 8 && r < size - 8) {
        const cellP = Math.min(1, timingVProgress * size - (r - 8));
        if (cellP > 0) return hexToRgba(color, 0.3 + 0.7 * cellP);
      }
      // Alignment patterns
      if (alignProgress > 0 && alignPositions.length > 0) {
        for (const ar of alignPositions) {
          for (const ac of alignPositions) {
            if (ar < 9 && ac < 9) continue;
            if (ar < 9 && ac > size - 9) continue;
            if (ar > size - 9 && ac < 9) continue;
            if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) {
              return hexToRgba(color, alignProgress * (val ? 0.9 : 0.3));
            }
          }
        }
      }
      return null;
    });

    // Grid overlay lines
    if (alignProgress > 0) {
      ctx.save();
      ctx.globalAlpha = alignProgress * 0.15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= size; i++) {
        ctx.beginPath();
        ctx.moveTo(gridX + i * modSize, gridY);
        ctx.lineTo(gridX + i * modSize, gridY + size * modSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(gridX, gridY + i * modSize);
        ctx.lineTo(gridX + size * modSize, gridY + i * modSize);
        ctx.stroke();
      }
      ctx.restore();
    }

    const hasAlign = this.data.version >= 2;
    this.drawInfoPanel(ctx, p, 1, [
      { t: 'Timing & Alignment', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
      { t: 'Timing patterns are alternating', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'black/white modules in row 6', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'and column 6. They help the', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'scanner count modules precisely.', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: '' },
      { t: hasAlign ? 'Alignment pattern found' : 'Version 1 — no alignment pattern', font: '15px "Segoe UI", sans-serif', color: '#e6edf3' },
    ]);
  }

  // =========================================
  // Step 3: Format Information
  // =========================================
  renderFormatInfo(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const grid = this.data.moduleGrid;
    const size = this.data.gridSize;
    const color = STEP_COLORS[2];
    const fi = this.data.formatInfo;

    const bitPositions = fi.formatBitPositions;
    const bitsRevealed = Math.floor(p * 2 * 15); // reveal bits in first half

    drawGrid(ctx, grid, gridX, gridY, modSize, (r, c, val) => {
      for (let i = 0; i < Math.min(bitsRevealed, 15); i++) {
        if (r === bitPositions[i][0] && c === bitPositions[i][1]) {
          return color;
        }
      }
      return null;
    });

    // Draw the binary readout on the right
    const xorProgress = Math.max(0, Math.min(1, (p - 0.5) / 0.2));
    const decodeProgress = Math.max(0, Math.min(1, (p - 0.7) / 0.15));
    const resultProgress = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

    // Raw bits string
    let rawBits = '';
    for (let i = 0; i < 15; i++) {
      const [r, c] = bitPositions[i];
      rawBits += grid[r][c] ? '1' : '0';
    }

    const lines = [
      { t: 'Format Information', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
      { t: '15 bits around top-left finder:', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: '' },
    ];

    // Show bits being read
    const shownBits = rawBits.slice(0, Math.min(15, bitsRevealed));
    lines.push({ t: `Raw: ${shownBits.padEnd(15, '·')}`, font: '16px Consolas, monospace', color: '#e6edf3' });

    if (xorProgress > 0) {
      const xoredBits = (parseInt(rawBits, 2) ^ 0x5412).toString(2).padStart(15, '0');
      lines.push({ t: '' });
      lines.push({ t: 'XOR Operation:', font: 'bold 15px "Segoe UI", sans-serif', color: hexToRgba(color, xorProgress) });
      lines.push({ t: '101010000010010 XOR', font: '16px Consolas, monospace', color: hexToRgba('#e6edf3', xorProgress) });
      lines.push({ t: rawBits + ' =', font: '16px Consolas, monospace', color: hexToRgba('#ffd93d', xorProgress) });
      lines.push({ t: xoredBits, font: 'bold 16px Consolas, monospace', color: hexToRgba('#6bcb77', xorProgress) });
    }

    if (decodeProgress > 0) {
      // Decode result
      const ecBits = rawBits.slice(0, 2);
      const maskBits = rawBits.slice(2, 5);
      lines.push({ t: '' });
      lines.push({ t: `EC bits: ${ecBits}`, font: '16px Consolas, monospace', color: hexToRgba('#e6edf3', decodeProgress) });
      lines.push({ t: `Mask bits: ${maskBits}`, font: '16px Consolas, monospace', color: hexToRgba('#e6edf3', decodeProgress) });
    }

    if (resultProgress > 0) {
      lines.push({ t: '' });
      lines.push({ t: `EC Level: ${fi.errorCorrectionLevel}`, font: 'bold 16px "Segoe UI", sans-serif', color: hexToRgba(color, resultProgress) });
      lines.push({ t: `Mask: #${fi.maskPattern}`, font: 'bold 16px "Segoe UI", sans-serif', color: hexToRgba(color, resultProgress) });
    }

    this.drawInfoPanel(ctx, 1, 2, lines);
  }

  // =========================================
  // Step 4: Mask Removal
  // =========================================
  renderMaskRemoval(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const size = this.data.gridSize;
    const color = STEP_COLORS[3];

    const formulaProgress = Math.min(1, p / 0.2);
    const overlayProgress = Math.max(0, Math.min(1, (p - 0.2) / 0.3));
    const sweepProgress = Math.max(0, Math.min(1, (p - 0.5) / 0.3));
    const finalProgress = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

    const sweepCol = Math.floor(sweepProgress * size);

    // Choose which grid to show based on sweep
    const displayGrid = this.data.moduleGrid;

    drawGrid(ctx, displayGrid, gridX, gridY, modSize, (r, c, val) => {
      const isReserved = this.reserved[r][c];

      // After sweep: show unmasked
      if (sweepProgress > 0 && c < sweepCol && !isReserved) {
        const uVal = this.unmaskedGrid[r][c];
        const flipped = uVal !== val;
        if (flipped && sweepProgress < 0.95) {
          // Flash effect for flipped modules
          return '#ffffff';
        }
        return uVal ? '#e6edf3' : '#1c2028';
      }

      // Mask overlay
      if (overlayProgress > 0 && !isReserved && this.maskGrid[r][c]) {
        return hexToRgba(color, overlayProgress * 0.5);
      }

      return null;
    });

    // Sweep line
    if (sweepProgress > 0 && sweepProgress < 1) {
      const sx = gridX + sweepCol * modSize;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(sx, gridY);
      ctx.lineTo(sx, gridY + size * modSize);
      ctx.stroke();
      ctx.restore();
    }

    const maskNum = this.data.formatInfo.maskPattern;
    const lines = [
      { t: 'Mask Removal', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
    ];

    if (formulaProgress > 0) {
      lines.push({ t: `Mask Pattern #${maskNum} Formula:`, font: 'bold 16px "Segoe UI", sans-serif', color: hexToRgba('#ffd93d', formulaProgress) });
      lines.push({ t: MASK_FORMULAS[maskNum], font: 'bold 16px Consolas, monospace', color: hexToRgba('#6bcb77', formulaProgress) });
      lines.push({ t: '' });

      // Show example calculation
      lines.push({ t: 'Example: row=5, col=3', font: '15px Consolas, monospace', color: hexToRgba('#8b949e', formulaProgress * 0.8) });
      const exampleResult = evaluateMaskFormula(maskNum, 5, 3);
      lines.push({ t: `Result: ${exampleResult} (${exampleResult === 1 ? 'flip' : 'keep'})`, font: '15px Consolas, monospace', color: hexToRgba(exampleResult === 1 ? '#ff6b6b' : '#6bcb77', formulaProgress * 0.8) });
      lines.push({ t: '' });
    }

    lines.push({ t: 'The mask is XOR-ed with the', font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
    lines.push({ t: 'data modules to reveal the', font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
    lines.push({ t: 'actual encoded information.', font: '15px "Segoe UI", sans-serif', color: '#8b949e' });

    // Show XOR operation during sweep
    if (sweepProgress > 0 && sweepProgress < 1) {
      const sweepColVal = Math.floor(sweepProgress * size);
      const exampleRow = Math.floor(size / 2); // Middle row

      if (sweepColVal < size && exampleRow < size && !this.reserved[exampleRow][sweepColVal]) {
        const moduleVal = this.data.moduleGrid[exampleRow][sweepColVal];
        const maskVal = this.maskGrid[exampleRow][sweepColVal];
        const resultVal = moduleVal ^ maskVal;

        lines.push({ t: '' });
        lines.push({ t: `Current module [${exampleRow},${sweepColVal}]:`, font: 'bold 15px Consolas, monospace', color: '#ffd93d' });
        lines.push({ t: `  Original: ${moduleVal} (${moduleVal ? 'black' : 'white'})`, font: '15px Consolas, monospace', color: '#8b949e' });
        lines.push({ t: `  Mask:     ${maskVal} (${maskVal ? 'flip' : 'keep'})`, font: '15px Consolas, monospace', color: '#8b949e' });
        lines.push({ t: `  XOR:      ${moduleVal} ⊕ ${maskVal} = ${resultVal}`, font: 'bold 15px Consolas, monospace', color: '#6bcb77' });
      }
    }

    this.drawInfoPanel(ctx, 1, 3, lines);
  }

  // =========================================
  // Step 5: Data Reading (Zig-Zag)
  // =========================================
  renderDataReading(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const size = this.data.gridSize;
    const color = STEP_COLORS[4];
    const order = this.zigZagOrder;

    // How many modules to reveal
    const maxShow = Math.min(order.length, 80);
    const revealed = Math.floor(p * maxShow * 1.2);

    // Use unmasked grid for data reading
    drawGrid(ctx, this.unmaskedGrid, gridX, gridY, modSize, (r, c, val) => {
      if (this.reserved[r][c]) return null;

      // Check if this module has been read
      for (let i = 0; i < Math.min(revealed, order.length); i++) {
        if (order[i][0] === r && order[i][1] === c) {
          // Fade based on how recently it was read
          const age = revealed - i;
          const alpha = Math.max(0.4, 1 - age / 30);
          return hexToRgba(color, alpha);
        }
      }

      // Dim unread data modules
      return val ? 'rgba(230,237,243,0.2)' : 'rgba(28,32,40,0.5)';
    });

    // Cursor at current position
    if (revealed < order.length && revealed > 0) {
      const [cr, cc] = order[Math.min(revealed, order.length - 1)];
      const cx = gridX + cc * modSize + modSize / 2;
      const cy = gridY + cr * modSize + modSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, modSize * 0.8, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    }

    // Draw zig-zag path (faint lines connecting recent modules)
    if (revealed > 1) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(color, 0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startI = Math.max(0, revealed - 30);
      for (let i = startI; i < Math.min(revealed, order.length); i++) {
        const [r, c] = order[i];
        const mx = gridX + c * modSize + modSize / 2;
        const my = gridY + r * modSize + modSize / 2;
        if (i === startI) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Bitstream display in info panel
    let bitstream = '';
    for (let i = 0; i < Math.min(revealed, order.length, 48); i++) {
      const [r, c] = order[i];
      bitstream += this.unmaskedGrid[r][c] ? '1' : '0';
    }

    // Format bitstream into groups of 8
    const groups = [];
    for (let i = 0; i < bitstream.length; i += 8) {
      groups.push(bitstream.slice(i, i + 8));
    }

    const lines = [
      { t: 'Zig-Zag Data Reading', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
      { t: 'Modules are read in 2-column', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'strips, zig-zagging from bottom-', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: 'right, alternating up and down.', font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: '' },
      { t: 'Bitstream:', font: 'bold 15px "Segoe UI", sans-serif', color: '#e6edf3' },
    ];

    // Show up to 4 groups
    for (let i = 0; i < Math.min(groups.length, 4); i++) {
      lines.push({ t: groups[i], font: '15px Consolas, monospace', color: color });
    }
    if (groups.length > 4) {
      lines.push({ t: '...', font: '15px Consolas, monospace', color: '#8b949e' });
    }

    lines.push({ t: '' });
    lines.push({ t: `${Math.min(revealed, order.length)} of ${order.length} bits read`, font: '15px "Segoe UI", sans-serif', color: '#8b949e' });

    this.drawInfoPanel(ctx, 1, 4, lines);
  }

  // =========================================
  // Step 6: Error Correction
  // =========================================
  renderErrorCorrection(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const size = this.data.gridSize;
    const color = STEP_COLORS[5];

    // Phase 1 (0-30%): Show data block structure
    const structureProgress = Math.min(1, p / 0.3);

    // Phase 2 (30-60%): Show error correction blocks
    const ecBlockProgress = Math.max(0, Math.min(1, (p - 0.3) / 0.3));

    // Phase 3 (60-100%): Show syndrome calculation concept
    const syndromeProgress = Math.max(0, Math.min(1, (p - 0.6) / 0.4));

    // Draw grid in background
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawGrid(ctx, this.unmaskedGrid, gridX, gridY, modSize, (r, c, val) => {
      if (this.reserved[r][c]) return null;
      return val ? 'rgba(230,237,243,0.3)' : 'rgba(28,32,40,0.3)';
    });
    ctx.restore();

    // Visualize data vs EC bytes
    const totalBytes = Math.floor(this.zigZagOrder.length / 8);
    const ecLevel = this.data.formatInfo.errorCorrectionLevel;

    // EC capacity by level: L=7%, M=15%, Q=25%, H=30%
    const ecPercentages = { 'L': 0.07, 'M': 0.15, 'Q': 0.25, 'H': 0.30 };
    const ecRatio = ecPercentages[ecLevel] || 0.15;
    const ecBytes = Math.floor(totalBytes * ecRatio);
    const dataBytes = totalBytes - ecBytes;

    // Draw blocks representation
    const blockW = 30;
    const blockH = 20;
    const startY = this.gridY + 50;

    // Data blocks
    if (structureProgress > 0) {
      ctx.fillStyle = hexToRgba('#4d96ff', structureProgress);
      for (let i = 0; i < dataBytes && i < 20; i++) {
        const x = gridX + (i % 10) * (blockW + 5);
        const y = startY + Math.floor(i / 10) * (blockH + 5);
        ctx.fillRect(x, y, blockW, blockH);
      }
    }

    // EC blocks
    if (ecBlockProgress > 0) {
      ctx.fillStyle = hexToRgba('#ff6b6b', ecBlockProgress);
      for (let i = 0; i < ecBytes && i < 10; i++) {
        const x = gridX + (i % 10) * (blockW + 5);
        const y = startY + 2 * (blockH + 5) + 30;
        ctx.fillRect(x, y, blockW, blockH);
      }
    }

    // Info panel
    const lines = [
      { t: 'Error Correction', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
      { t: `Error Correction Level: ${ecLevel}`, font: '16px "Segoe UI", sans-serif', color: '#e6edf3' },
      { t: `Data capacity: ~${Math.floor((1 - ecRatio) * 100)}%`, font: '15px "Segoe UI", sans-serif', color: '#8b949e' },
      { t: '' },
    ];

    if (structureProgress > 0) {
      lines.push({ t: 'Data Blocks:', font: 'bold 16px "Segoe UI", sans-serif', color: '#4d96ff' });
      lines.push({ t: `${dataBytes} bytes of actual data`, font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
      lines.push({ t: '' });
    }

    if (ecBlockProgress > 0) {
      lines.push({ t: 'Error Correction Blocks:', font: 'bold 16px "Segoe UI", sans-serif', color: '#ff6b6b' });
      lines.push({ t: `${ecBytes} bytes for error detection`, font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
      lines.push({ t: 'and correction (Reed-Solomon)', font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
      lines.push({ t: '' });
    }

    if (syndromeProgress > 0) {
      lines.push({ t: 'Reed-Solomon Process:', font: 'bold 16px "Segoe UI", sans-serif', color: '#ffd93d' });
      lines.push({ t: '1. Calculate syndrome', font: '15px Consolas, monospace', color: hexToRgba('#8b949e', syndromeProgress) });
      lines.push({ t: '2. Locate errors using Galois field', font: '15px Consolas, monospace', color: hexToRgba('#8b949e', syndromeProgress) });
      lines.push({ t: '3. Correct corrupted bytes', font: '15px Consolas, monospace', color: hexToRgba('#8b949e', syndromeProgress) });
      lines.push({ t: '' });
      lines.push({ t: 'QR codes can recover from:', font: '15px "Segoe UI", sans-serif', color: '#6bcb77' });
      lines.push({ t: `• Up to ${Math.floor(ecBytes / 2)} byte errors`, font: '15px "Segoe UI", sans-serif', color: '#6bcb77' });
      lines.push({ t: `• Or ${ecBytes} erasures`, font: '15px "Segoe UI", sans-serif', color: '#6bcb77' });
    }

    this.drawInfoPanel(ctx, 1, 5, lines);
  }

  // =========================================
  // Step 7: Decoding
  // =========================================
  renderDecoding(p) {
    const ctx = this.ctx;
    const { gridX, gridY, modSize } = this;
    const color = STEP_COLORS[5];
    const text = this.data.decodedText;

    // Draw grid faded in background
    drawGrid(ctx, this.unmaskedGrid, gridX, gridY, modSize, (r, c, val) => {
      if (this.reserved[r][c]) return null;
      return val ? 'rgba(230,237,243,0.15)' : 'rgba(28,32,40,0.3)';
    });

    // Read first bits to determine mode
    const order = this.zigZagOrder;
    let bitstring = '';
    for (let i = 0; i < Math.min(order.length, 200); i++) {
      const [r, c] = order[i];
      bitstring += this.unmaskedGrid[r][c] ? '1' : '0';
    }

    const modeProgress = Math.min(1, p / 0.15);
    const countProgress = Math.max(0, Math.min(1, (p - 0.15) / 0.15));
    const charsProgress = Math.max(0, Math.min(1, (p - 0.3) / 0.55));
    const finalProgress = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

    const modeBits = bitstring.slice(0, 4);
    const modeNames = { '0001': 'Numeric', '0010': 'Alphanumeric', '0100': 'Byte', '1000': 'Kanji' };
    const modeName = modeNames[modeBits] || 'Byte';

    // Character count length depends on mode and version
    let ccLen = 8; // default for byte mode v1-9
    if (modeBits === '0001') ccLen = 10;
    else if (modeBits === '0010') ccLen = 9;

    const countBits = bitstring.slice(4, 4 + ccLen);
    const charCount = parseInt(countBits, 2);
    const dataBitsStart = 4 + ccLen;

    const lines = [
      { t: 'Decoding', font: 'bold 18px "Segoe UI", sans-serif', color: color },
      { t: '' },
    ];

    if (modeProgress > 0) {
      lines.push({ t: `Mode: ${modeBits}`, font: '16px Consolas, monospace', color: hexToRgba('#e6edf3', modeProgress) });
      lines.push({ t: `= ${modeName} Mode`, font: 'bold 15px "Segoe UI", sans-serif', color: hexToRgba(color, modeProgress) });
      lines.push({ t: '' });
    }

    if (countProgress > 0) {
      lines.push({ t: `Count: ${countBits}`, font: '16px Consolas, monospace', color: hexToRgba('#e6edf3', countProgress) });
      lines.push({ t: `= ${charCount} characters`, font: 'bold 15px "Segoe UI", sans-serif', color: hexToRgba(color, countProgress) });
      lines.push({ t: '' });
    }

    // Show characters decoding
    if (charsProgress > 0) {
      lines.push({ t: 'Data bytes:', font: 'bold 15px "Segoe UI", sans-serif', color: '#e6edf3' });

      const charsToShow = Math.floor(charsProgress * Math.min(text.length, 12));
      for (let i = 0; i < charsToShow; i++) {
        const byteStart = dataBitsStart + i * 8;
        const byteBits = bitstring.slice(byteStart, byteStart + 8);
        const char = text[i] || '?';
        lines.push({
          t: `${byteBits} → "${char}"`,
          font: '15px Consolas, monospace',
          color: color
        });
      }

      if (text.length > 12 && charsToShow >= 12) {
        lines.push({ t: `... (${text.length - 12} more)`, font: '15px "Segoe UI", sans-serif', color: '#8b949e' });
      }
    }

    this.drawInfoPanel(ctx, 1, 6, lines);

    // Final decoded text in center
    if (finalProgress > 0) {
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.save();
      ctx.globalAlpha = finalProgress;

      // Background overlay
      ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
      ctx.fillRect(0, H * 0.7, W, H * 0.3);

      // Decoded text
      const fontSize = Math.min(28, W / (text.length * 0.8 + 2));
      ctx.font = `bold ${fontSize}px Consolas, monospace`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = color;
      ctx.shadowBlur = 15 * finalProgress;

      // Truncate if very long
      const displayText = text.length > 60 ? text.slice(0, 57) + '...' : text;
      ctx.fillText(displayText, W / 2, H * 0.85);

      ctx.restore();
    }
  }

  // =========================================
  // Shared: Info Panel Renderer
  // =========================================
  drawInfoPanel(ctx, fadeIn, stepIdx, lines) {
    const x = this.infoX;
    let y = this.infoY;
    const lineHeight = 24;  // Increased from 18

    ctx.save();
    ctx.globalAlpha = Math.min(1, fadeIn);

    lines.forEach((line) => {
      if (!line.t) {
        y += lineHeight * 0.5;
        return;
      }
      ctx.font = line.font || '15px "Segoe UI", system-ui, sans-serif';  // Increased from 13px
      ctx.fillStyle = line.color || '#e6edf3';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(line.t, x, y);
      y += lineHeight;
    });

    ctx.restore();
  }
}
