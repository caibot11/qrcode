import * as THREE from 'three';
import {
  buildReservedMap, getAlignmentPositions, computeZigZagOrder,
  generateMaskGrid, MASK_FORMULAS,
  easeOutCubic, lerp, hexToRgbNorm,
  STAGE_COLORS
} from './qr-helpers.js';

const CAT_FINDER = 0;
const CAT_SEPARATOR = 1;
const CAT_TIMING = 2;
const CAT_ALIGNMENT = 3;
const CAT_FORMAT = 4;
const CAT_DARK = 5;
const CAT_DATA = 6;

const STAGE_RGB = STAGE_COLORS.map(hexToRgbNorm);

export const qrDelegate = {
  categorizeModules(vizData, base) {
    const size = vizData.gridSize;
    const version = vizData.version;

    // Precompute QR structure
    base._qrReserved = buildReservedMap(size, version);
    base._qrZigZag = computeZigZagOrder(size, version);
    base._qrMaskGrid = generateMaskGrid(size, vizData.formatInfo.maskPattern);
    base._qrAlignPositions = getAlignmentPositions(version);
    base._qrUnmaskedGrid = vizData.moduleGrid.map((row, r) =>
      row.map((val, c) => base._qrReserved[r][c] ? val : val ^ base._qrMaskGrid[r][c])
    );

    const modules = [];
    const fmtSet = new Set();
    const fmtPositions = vizData.formatInfo.formatBitPositions;
    for (const [r, c] of fmtPositions) fmtSet.add(r * size + c);
    for (let i = 0; i < 7; i++) fmtSet.add((size - 1 - i) * size + 8);
    for (let i = 0; i < 8; i++) fmtSet.add(8 * size + (size - 8 + i));

    const alignSet = new Set();
    for (const ar of base._qrAlignPositions) {
      for (const ac of base._qrAlignPositions) {
        if (ar < 9 && ac < 9) continue;
        if (ar < 9 && ac > size - 9) continue;
        if (ar > size - 9 && ac < 9) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            alignSet.add((ar + dr) * size + (ac + dc));
          }
        }
      }
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const key = r * size + c;
        const val = vizData.moduleGrid[r][c];
        let cat;

        const inTLFinder = r < 7 && c < 7;
        const inTRFinder = r < 7 && c >= size - 7;
        const inBLFinder = r >= size - 7 && c < 7;

        if (inTLFinder || inTRFinder || inBLFinder) {
          cat = CAT_FINDER;
        } else if (
          (r < 8 && c === 7) || (r === 7 && c < 8) ||
          (r < 8 && c === size - 8) || (r === 7 && c >= size - 8) ||
          (r === size - 8 && c < 8) || (r >= size - 8 && c === 7)
        ) {
          cat = CAT_SEPARATOR;
        } else if (r === (4 * version + 9) && c === 8) {
          cat = CAT_DARK;
        } else if (fmtSet.has(key)) {
          cat = CAT_FORMAT;
        } else if (alignSet.has(key)) {
          cat = CAT_ALIGNMENT;
        } else if ((r === 6 && c > 7 && c < size - 8) || (c === 6 && r > 7 && r < size - 8)) {
          cat = CAT_TIMING;
        } else if (base._qrReserved[r][c]) {
          cat = CAT_SEPARATOR;
        } else {
          cat = CAT_DATA;
        }

        modules.push({ row: r, col: c, cat, val, _y: 0, _r: 0, _g: 0, _b: 0, _opacity: 1 });
      }
    }

    // Precompute data module indices in zig-zag order
    base._qrDataModuleIndices = [];
    const moduleMap = new Map();
    modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));
    for (const [r, c] of base._qrZigZag) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined) base._qrDataModuleIndices.push(idx);
    }

    const totalDataModules = base._qrDataModuleIndices.length;
    base._qrDataCodewordCount = Math.floor(totalDataModules * 0.6);

    return modules;
  },

  setupExtras(scene, gridSize, halfSize) {
    const maskGeo = new THREE.PlaneGeometry(gridSize - 2, gridSize - 2);
    const maskMat = new THREE.MeshBasicMaterial({
      color: 0x6bcb77, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const maskPlane = new THREE.Mesh(maskGeo, maskMat);
    maskPlane.rotation.x = -Math.PI / 2;
    maskPlane.position.y = 3;
    maskPlane.visible = false;
    scene.add(maskPlane);

    const cursorGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0x9b59b6, transparent: true, opacity: 0.9
    });
    const cursor = new THREE.Mesh(cursorGeo, cursorMat);
    cursor.visible = false;
    scene.add(cursor);

    const trailMat = new THREE.LineBasicMaterial({
      color: 0x9b59b6, transparent: true, opacity: 0.3
    });
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(600 * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.visible = false;
    scene.add(trail);

    const shieldGeo = new THREE.IcosahedronGeometry(gridSize * 0.4, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x4d96ff, transparent: true, opacity: 0, wireframe: true
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 2;
    shield.visible = false;
    scene.add(shield);

    return { maskPlane, cursor, trail, trailPositions, shield };
  },

  hideExtras(extras) {
    if (!extras) return;
    extras.maskPlane.visible = false;
    extras.maskPlane.material.opacity = 0;
    extras.cursor.visible = false;
    extras.trail.visible = false;
    extras.shield.visible = false;
    extras.shield.material.opacity = 0;
  },

  disposeExtras(extras) {
    if (!extras) return;
    const objs = [extras.maskPlane, extras.cursor, extras.trail, extras.shield];
    for (const obj of objs) {
      if (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      }
    }
  },

  cleanupStage(step, base) {
    // No-op — extras are hidden in goToStep
  },

  onLoadNew(vizData, base) {
    // Recompute QR structures for new data
    base._qrReserved = buildReservedMap(vizData.gridSize, vizData.version);
    base._qrZigZag = computeZigZagOrder(vizData.gridSize, vizData.version);
    base._qrMaskGrid = generateMaskGrid(vizData.gridSize, vizData.formatInfo.maskPattern);
    base._qrAlignPositions = getAlignmentPositions(vizData.version);
    base._qrUnmaskedGrid = vizData.moduleGrid.map((row, r) =>
      row.map((val, c) => base._qrReserved[r][c] ? val : val ^ base._qrMaskGrid[r][c])
    );
  },

  renderStage(step, p, base) {
    base.setDefaultColors();
    switch (step) {
      case 0: renderStage0(p, base); break;
      case 1: renderStage1(p, base); break;
      case 2: renderStage2(p, base); break;
      case 3: renderStage3(p, base); break;
      case 4: renderStage4(p, base); break;
    }
  }
};

// =========================================
// Stage 0: Structure
// =========================================

function renderStage0(p, base) {
  const sc = STAGE_RGB[0];
  const fadeIn = Math.min(1, p / 0.15);
  const finderP = Math.max(0, Math.min(1, (p - 0.15) / 0.35));
  const timingP = Math.max(0, Math.min(1, (p - 0.5) / 0.2));
  const alignP = Math.max(0, Math.min(1, (p - 0.7) / 0.15));
  const labelP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  for (const m of base.modules) {
    const baseAlpha = fadeIn;
    if (m.val) {
      m._r = 0.78 * baseAlpha; m._g = 0.8 * baseAlpha; m._b = 0.84 * baseAlpha;
    } else {
      m._r = 0.1 * baseAlpha; m._g = 0.11 * baseAlpha; m._b = 0.14 * baseAlpha;
    }

    if (m.cat === CAT_FINDER && finderP > 0) {
      let delay = 0;
      if (m.row < 7 && m.col >= base.gridSize - 7) delay = 0.4;
      if (m.row >= base.gridSize - 7) delay = 0.75;
      const fp = Math.max(0, Math.min(1, (finderP - delay) / (1 - delay)));
      const ep = easeOutCubic(fp);
      m._y = ep * 2;
      if (m.val) {
        const glow = ep * (0.8 + 0.2 * glowPulse);
        m._r = lerp(m._r, sc.r * glow, ep);
        m._g = lerp(m._g, sc.g * glow, ep);
        m._b = lerp(m._b, sc.b * glow, ep);
      }
    }

    if (m.cat === CAT_TIMING && timingP > 0) {
      const ep = easeOutCubic(timingP);
      m._y = ep * 1.0;
      if (m.val) {
        m._r = lerp(m._r, 1.0, ep);
        m._g = lerp(m._g, 0.85, ep);
        m._b = lerp(m._b, 0.24, ep);
      }
    }

    if (m.cat === CAT_ALIGNMENT && alignP > 0) {
      const ep = easeOutCubic(alignP);
      m._y = ep * 1.5;
      if (m.val) {
        m._r = lerp(m._r, 1.0, ep);
        m._g = lerp(m._g, 0.55, ep);
        m._b = lerp(m._b, 0.2, ep);
      }
    }
  }

  if (labelP > 0) {
    base.showLabel('tl-finder', 'Finder Pattern', -base.halfSize + 3.5, 3.5, -base.halfSize + 3.5);
    base.showLabel('tr-finder', 'Finder Pattern', base.halfSize - 3.5, 3.5, -base.halfSize + 3.5);
    base.showLabel('bl-finder', 'Finder Pattern', -base.halfSize + 3.5, 3.5, base.halfSize - 3.5);
    if (base._qrAlignPositions.length > 0) {
      const ac = 18 - base.halfSize + 0.5;
      base.showLabel('alignment', 'Alignment', ac, 3, ac);
    }
    base.showLabel('timing', 'Timing Strips', 0, 2.2, -base.halfSize + 6.5);
  }

  base.emitStageData('structure', {
    gridSize: base.gridSize,
    version: base.data.version,
    finderCount: 3,
    hasAlignment: base._qrAlignPositions.length > 0
  });
}

// =========================================
// Stage 1: Format & Mask
// =========================================

function renderStage1(p, base) {
  const sc = STAGE_RGB[1];
  const formatP = Math.min(1, p / 0.3);
  const maskAppearP = Math.max(0, Math.min(1, (p - 0.3) / 0.2));
  const maskPeelP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const flashP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  for (const m of base.modules) {
    if (m.cat === CAT_FORMAT && formatP > 0) {
      const ep = easeOutCubic(formatP);
      m._y = ep * 1.5;
      m._r = lerp(m._r, sc.r, ep);
      m._g = lerp(m._g, sc.g, ep);
      m._b = lerp(m._b, sc.b, ep);
    }

    if (m.cat === CAT_DATA && flashP > 0) {
      const unmasked = base._qrUnmaskedGrid[m.row][m.col];
      const flipped = unmasked !== m.val;
      if (flipped) {
        const flash = Math.sin(flashP * Math.PI * 4) * 0.5 + 0.5;
        m._r = lerp(m._r, 1.0, flash * flashP);
        m._g = lerp(m._g, 1.0, flash * flashP);
        m._b = lerp(m._b, 1.0, flash * flashP);
      }
    }
  }

  const extras = base.extras;
  if (maskAppearP > 0 && maskPeelP < 1) {
    extras.maskPlane.visible = true;
    if (maskPeelP > 0) {
      const peelEased = lerp(0, 1, maskPeelP);
      extras.maskPlane.position.x = peelEased * base.gridSize;
      extras.maskPlane.rotation.y = peelEased * Math.PI * 0.3;
      extras.maskPlane.rotation.x = -Math.PI / 2 + peelEased * 0.3;
      extras.maskPlane.material.opacity = 0.35 * (1 - peelEased);
    } else {
      extras.maskPlane.position.x = 0;
      extras.maskPlane.rotation.y = 0;
      extras.maskPlane.rotation.x = -Math.PI / 2;
      extras.maskPlane.material.opacity = easeOutCubic(maskAppearP) * 0.35;
    }
  } else {
    extras.maskPlane.visible = false;
  }

  if (formatP > 0.5) {
    base.showLabel('format-bits', '15 Format Bits', -base.halfSize + 8, 2.8, -base.halfSize + 4);
    base.showLabel('format-info',
      `EC: ${base.data.formatInfo.errorCorrectionLevel} | Mask: #${base.data.formatInfo.maskPattern}`,
      0, 2.8, -base.halfSize - 1);
  }
  if (maskAppearP > 0.3 && maskPeelP < 0.5) {
    base.showLabel('mask-label', 'Mask Pattern', 0, 4, 0);
  }

  const maskNum = base.data.formatInfo.maskPattern;
  base.emitStageData('format', {
    ecLevel: base.data.formatInfo.errorCorrectionLevel,
    maskPattern: maskNum,
    maskFormula: MASK_FORMULAS[maskNum] || '',
    rawBits: base.data.formatInfo.raw,
    xorMask: 0x5412
  });
}

// =========================================
// Stage 2: Data Reading
// =========================================

function renderStage2(p, base) {
  const sc = STAGE_RGB[2];
  const readP = Math.max(0, Math.min(1, p / 0.9));
  const pullbackP = Math.max(0, Math.min(1, (p - 0.9) / 0.1));

  if (pullbackP > 0) {
    base.defaultCameraGoal();
  }

  const totalModules = base._qrDataModuleIndices.length;
  let revealed;
  if (readP <= 0) {
    revealed = 0;
  } else {
    const threshold = 0.2;
    const normalCount = Math.floor(totalModules * 0.2);
    if (readP <= threshold) {
      revealed = Math.floor((readP / threshold) * normalCount);
    } else {
      const remaining = totalModules - normalCount;
      const acceleratedP = (readP - threshold) / (1 - threshold);
      revealed = normalCount + Math.floor(acceleratedP * remaining);
    }
  }
  revealed = Math.min(revealed, totalModules);

  for (const m of base.modules) {
    if (m.cat === CAT_DATA) {
      m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
    }
  }

  const trailStart = Math.max(0, revealed - 60);
  let trailCount = 0;
  const extras = base.extras;

  for (let i = 0; i < revealed && i < totalModules; i++) {
    const idx = base._qrDataModuleIndices[i];
    const m = base.modules[idx];
    const age = revealed - i;
    const brightness = Math.max(0.3, 1 - age / 70);

    m._r = sc.r * brightness;
    m._g = sc.g * brightness;
    m._b = sc.b * brightness;
    m._y = brightness * 0.3;

    if (i >= trailStart && trailCount < 599) {
      const px = m.col - base.halfSize + 0.5;
      const py = m._y + 0.2;
      const pz = m.row - base.halfSize + 0.5;
      extras.trailPositions[trailCount * 3] = px;
      extras.trailPositions[trailCount * 3 + 1] = py;
      extras.trailPositions[trailCount * 3 + 2] = pz;
      trailCount++;
    }
  }

  if (trailCount > 1) {
    extras.trail.visible = true;
    extras.trail.geometry.attributes.position.needsUpdate = true;
    extras.trail.geometry.setDrawRange(0, trailCount);
  } else {
    extras.trail.visible = false;
  }

  if (revealed > 0 && revealed < totalModules) {
    const curIdx = base._qrDataModuleIndices[Math.min(revealed, totalModules - 1)];
    const cm = base.modules[curIdx];
    extras.cursor.visible = true;
    extras.cursor.position.set(
      cm.col - base.halfSize + 0.5,
      0.5,
      cm.row - base.halfSize + 0.5
    );
    const pulse = 0.35 + 0.15 * Math.sin(performance.now() * 0.008);
    extras.cursor.scale.setScalar(pulse / 0.45);
  } else {
    extras.cursor.visible = false;
  }

  const labelCount = Math.min(6, revealed);
  for (let i = 0; i < labelCount; i++) {
    const readIdx = revealed - labelCount + i;
    if (readIdx < 0 || readIdx >= totalModules) continue;
    const idx = base._qrDataModuleIndices[readIdx];
    const m = base.modules[idx];
    const bitVal = base._qrUnmaskedGrid[m.row][m.col];
    base.showLabel(`bit-${i}`, bitVal.toString(),
      m.col - base.halfSize + 0.5, 1.2, m.row - base.halfSize + 0.5, 'label-bit'
    );
  }

  let bits = '';
  const bitsToShow = Math.min(revealed, totalModules);
  for (let i = 0; i < Math.min(bitsToShow, 64); i++) {
    const idx = base._qrDataModuleIndices[i];
    const m = base.modules[idx];
    bits += base._qrUnmaskedGrid[m.row][m.col];
    if ((i + 1) % 8 === 0 && i < 63) bits += ' ';
  }

  base.emitStageData('dataReading', {
    revealed,
    total: totalModules,
    bitstream: bits
  });
}

// =========================================
// Stage 3: Error Correction
// =========================================

function renderStage3(p, base) {
  const separateP = Math.min(1, p / 0.25);
  const shieldP = Math.max(0, Math.min(1, (p - 0.25) / 0.25));
  const damageP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const returnP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  const dataColor = { r: 0.3, g: 0.59, b: 1.0 };
  const ecColor = { r: 1.0, g: 0.42, b: 0.42 };
  let damagedCount = 0;
  let repairedCount = 0;

  for (let i = 0; i < base._qrDataModuleIndices.length; i++) {
    const idx = base._qrDataModuleIndices[i];
    const m = base.modules[idx];
    const isData = i < base._qrDataCodewordCount;

    if (separateP > 0) {
      const sepEased = easeOutCubic(separateP);
      const retEased = returnP > 0 ? easeOutCubic(returnP) : 0;

      if (isData) {
        m._y = sepEased * 2.0 * (1 - retEased);
        m._r = lerp(m._r, dataColor.r, sepEased);
        m._g = lerp(m._g, dataColor.g, sepEased);
        m._b = lerp(m._b, dataColor.b, sepEased);
      } else {
        m._y = sepEased * -1.0 * (1 - retEased);
        m._r = lerp(m._r, ecColor.r, sepEased);
        m._g = lerp(m._g, ecColor.g, sepEased);
        m._b = lerp(m._b, ecColor.b, sepEased);
      }
    }

    if (damageP > 0 && isData) {
      const damageIdx = i % 7;
      if (damageIdx === 0) {
        damagedCount++;
        if (damageP < 0.5) {
          const dP = damageP * 2;
          m._r = lerp(dataColor.r, 1.0, dP);
          m._g = lerp(dataColor.g, 0.2, dP);
          m._b = lerp(dataColor.b, 0.2, dP);
        } else {
          repairedCount++;
          const rP = (damageP - 0.5) * 2;
          const flash = Math.sin(rP * Math.PI * 3);
          if (flash > 0) {
            m._r = 1.0; m._g = 1.0; m._b = 1.0;
          } else {
            m._r = dataColor.r; m._g = dataColor.g; m._b = dataColor.b;
          }
        }
      }
    }
  }

  const extras = base.extras;
  if (shieldP > 0 && returnP < 1) {
    extras.shield.visible = true;
    const shieldEased = easeOutCubic(shieldP);
    extras.shield.material.opacity = shieldEased * 0.45 * (1 - returnP);
    extras.shield.scale.setScalar(0.5 + shieldEased * 0.5);
    extras.shield.rotation.y += 0.005;
  } else {
    extras.shield.visible = false;
  }

  if (separateP > 0.5) {
    base.showLabel('data-label', `Data Bytes (${Math.floor(base._qrDataCodewordCount / 8)})`, 0, 3.5, 0, 'label-data');
    base.showLabel('ec-label', 'Error Correction Bytes', 0, -0.5, 0, 'label-ec');
  }
  if (damageP > 0.3 && damageP < 0.7) {
    base.showLabel('damage-label', 'Damage detected!', -base.halfSize, 4, 0, 'label-warning');
  }
  if (damageP > 0.7) {
    base.showLabel('repair-label', 'Repaired!', -base.halfSize, 4, 0, 'label-success');
  }

  const dataBytes = Math.floor(base._qrDataCodewordCount / 8);
  const ecBytes = Math.floor((base._qrDataModuleIndices.length - base._qrDataCodewordCount) / 8);
  base.emitStageData('errorCorrection', {
    dataBytes, ecBytes,
    damaged: damageP > 0.1 ? damagedCount : 0,
    repaired: damageP > 0.5 ? repairedCount : 0
  });
}

// =========================================
// Stage 4: Final Decode
// =========================================

// Distinct colors per decoded character
const CHAR_COLORS = [
  { r: 1.0, g: 0.40, b: 0.40 },  // red
  { r: 0.40, g: 0.80, b: 1.0 },  // blue
  { r: 1.0, g: 0.75, b: 0.25 },  // gold
  { r: 0.55, g: 1.0, b: 0.55 },  // green
  { r: 0.85, g: 0.50, b: 1.0 },  // purple
  { r: 1.0, g: 0.55, b: 0.20 },  // orange
  { r: 0.30, g: 1.0, b: 0.85 },  // cyan
  { r: 1.0, g: 0.45, b: 0.70 },  // pink
  { r: 0.70, g: 0.85, b: 0.30 },  // lime
  { r: 0.60, g: 0.60, b: 1.0 },  // periwinkle
  { r: 1.0, g: 0.65, b: 0.50 },  // salmon
  { r: 0.45, g: 0.90, b: 0.65 },  // mint
];

function renderStage4(p, base) {
  const text = base.data.decodedText;
  const maxChars = Math.min(text.length, 48);

  const revealP = Math.min(1, p / 0.7);
  const charsRevealed = Math.floor(revealP * (maxChars + 0.999));
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  // Dim all modules
  for (const m of base.modules) {
    m._y = 0;
    m._r *= 0.3;
    m._g *= 0.3;
    m._b *= 0.3;
  }

  const decodeTable = [];
  const currentCharIdx = Math.min(charsRevealed, maxChars) - 1;

  // Color each revealed character's modules
  for (let i = 0; i < Math.min(charsRevealed, maxChars); i++) {
    const char = text[i];
    const charCode = char.charCodeAt(0);
    decodeTable.push({
      binary: charCode.toString(2).padStart(8, '0'),
      hex: '0x' + charCode.toString(16).toUpperCase().padStart(2, '0'),
      char
    });

    const cc = CHAR_COLORS[i % CHAR_COLORS.length];
    const isCurrent = (i === currentCharIdx) && revealP < 1;
    const pulse = isCurrent ? (0.8 + 0.2 * Math.sin(performance.now() * 0.008)) : 1.0;

    const startBit = i * 8;
    let cx = 0, cz = 0, count = 0;

    for (let b = 0; b < 8; b++) {
      const moduleIdx = startBit + b;
      if (moduleIdx < base._qrDataModuleIndices.length) {
        const idx = base._qrDataModuleIndices[moduleIdx];
        const m = base.modules[idx];
        m._r = cc.r * pulse;
        m._g = cc.g * pulse;
        m._b = cc.b * pulse;
        m._y = isCurrent ? 1.2 : 0.5;
        cx += (m.col - base.halfSize + 0.5);
        cz += (m.row - base.halfSize + 0.5);
        count++;

        // Show 0/1 on the current character's modules
        if (isCurrent) {
          base.showLabel(`bit-${b}`, m.val ? '1' : '0',
            m.col - base.halfSize + 0.5, 2.0,
            m.row - base.halfSize + 0.5, 'label-bit');
        }
      }
    }

    // Only show ONE label — the current character being decoded — at its module position
    if (isCurrent && count > 0) {
      cx /= count;
      cz /= count;
      base.showLabel('current-char', `"${char}"`, cx, 3.0, cz, 'label-char-big');
    }
  }

  // Show running "decoded so far" text above the grid
  if (charsRevealed > 0) {
    const decodedSoFar = text.substring(0, Math.min(charsRevealed, maxChars));
    base.showLabel('decoded-progress', decodedSoFar, 0, 4.5, 0, 'label-decoded');
  }

  // Hide bit labels when not actively decoding
  if (currentCharIdx < 0 || revealP >= 1) {
    for (let b = 0; b < 8; b++) base.hideLabel(`bit-${b}`);
    base.hideLabel('current-char');
  }

  // Keep finder patterns subtly visible
  for (const m of base.modules) {
    if (m.cat === CAT_FINDER && m.val) {
      m._r = Math.max(m._r, 0.25);
      m._g = Math.max(m._g, 0.25);
      m._b = Math.max(m._b, 0.28);
    }
  }

  if (finalP > 0) {
    const dist = base.gridSize * 1.1;
    base.setCameraGoal(dist * 0.5, dist * 0.9, dist * 0.5, 0, 1, 0);
    base.showLabel('decoded-progress', `"${text}"`, 0, 5, 0, 'label-decoded');
    for (let b = 0; b < 8; b++) base.hideLabel(`bit-${b}`);
    base.hideLabel('current-char');
  }

  base.emitStageData('decode', {
    table: decodeTable,
    fullText: charsRevealed >= maxChars ? text : null
  });
}
