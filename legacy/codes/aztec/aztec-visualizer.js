import * as THREE from 'three';
import {
  easeOutCubic, lerp, hexToRgbNorm,
  AZTEC_STAGE_COLORS, AZ_CAT_BULLSEYE, AZ_CAT_MODE, AZ_CAT_DATA,
  categorizeAztecModules, computeAztecSpiralOrder
} from './aztec-helpers.js';

const STAGE_RGB = AZTEC_STAGE_COLORS.map(hexToRgbNorm);

export const aztecDelegate = {
  categorizeModules(vizData, base) {
    const size = vizData.gridSize;
    const catInfo = categorizeAztecModules(size);
    const spiralOrder = computeAztecSpiralOrder(size);
    base._azSpiralOrder = spiralOrder;

    const modules = [];
    for (let i = 0; i < catInfo.length; i++) {
      const { row, col, cat, ring } = catInfo[i];
      const val = vizData.moduleGrid[row][col];
      modules.push({
        row, col, cat, val, ring,
        _y: 0, _r: 0, _g: 0, _b: 0, _opacity: 1
      });
    }

    // Precompute data module indices in spiral order
    const moduleMap = new Map();
    modules.forEach((m, i) => moduleMap.set(m.row * size + m.col, i));
    base._azDataIndices = [];
    for (const [r, c] of spiralOrder) {
      const idx = moduleMap.get(r * size + c);
      if (idx !== undefined && modules[idx].cat === AZ_CAT_DATA) {
        base._azDataIndices.push(idx);
      }
    }
    base._azDataCodewordCount = Math.floor(base._azDataIndices.length * 0.6);

    return modules;
  },

  setupExtras(scene, gridSize, halfSize) {
    // Cursor for spiral read
    const cursorGeo = new THREE.SphereGeometry(0.45, 16, 16);
    const cursorMat = new THREE.MeshBasicMaterial({
      color: 0x4d96ff, transparent: true, opacity: 0.9
    });
    const cursor = new THREE.Mesh(cursorGeo, cursorMat);
    cursor.visible = false;
    scene.add(cursor);

    // Shield dome
    const shieldGeo = new THREE.IcosahedronGeometry(gridSize * 0.4, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x6bcb77, transparent: true, opacity: 0, wireframe: true
    });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.y = 2;
    shield.visible = false;
    scene.add(shield);

    return { cursor, shield };
  },

  hideExtras(extras) {
    if (!extras) return;
    extras.cursor.visible = false;
    extras.shield.visible = false;
    extras.shield.material.opacity = 0;
  },

  disposeExtras(extras) {
    if (!extras) return;
    for (const obj of Object.values(extras)) {
      if (obj?.geometry) obj.geometry.dispose();
      if (obj?.material) obj.material.dispose();
    }
  },

  cleanupStage() {},

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

// Stage 0: Bullseye Finder — center rings rise innermost to outermost
function renderStage0(p, base) {
  const sc = STAGE_RGB[0]; // purple
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  // Camera starts zoomed on center, pulls back
  const zoomP = Math.min(1, p / 0.3);
  const center = Math.floor(base.gridSize / 2);
  if (zoomP < 1) {
    const close = base.gridSize * 0.4;
    const far = base.gridSize * 0.9;
    const dist = lerp(close, far, easeOutCubic(zoomP));
    base.setCameraGoal(dist * 0.5, dist * 0.8, dist * 0.5, 0, 0, 0);
  } else {
    base.defaultCameraGoal();
  }

  for (const m of base.modules) {
    if (m.cat === AZ_CAT_BULLSEYE) {
      // Stagger by ring: ring 0 first, then 1, then 2
      const ringDelay = m.ring * 0.25;
      const localP = Math.max(0, Math.min(1, (p - ringDelay) / 0.4));
      const ep = easeOutCubic(localP);
      m._y = ep * (3 - m.ring * 0.5); // Center rises highest
      if (m.val) {
        const glow = ep * (0.8 + 0.2 * glowPulse);
        m._r = lerp(m._r, sc.r * glow, ep);
        m._g = lerp(m._g, sc.g * glow, ep);
        m._b = lerp(m._b, sc.b * glow, ep);
      }
    }
  }

  if (p > 0.7) {
    base.showLabel('bullseye-label', 'Bullseye Finder', 0, 5, 0);
    base.showLabel('ring-0', 'Center', 0, 4, 0);
  }

  base.emitStageData('structure', {
    gridSize: base.gridSize,
    type: 'Aztec Code (Compact)',
    finderType: 'Bullseye'
  });
}

// Stage 1: Mode Message — ring around bullseye highlights
function renderStage1(p, base) {
  const sc = STAGE_RGB[1]; // red
  const riseP = Math.min(1, p / 0.5);
  const infoP = Math.max(0, Math.min(1, (p - 0.5) / 0.5));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);

  for (const m of base.modules) {
    if (m.cat === AZ_CAT_MODE) {
      const ep = easeOutCubic(riseP);
      m._y = ep * 1.5;
      if (m.val) {
        m._r = lerp(m._r, sc.r * (0.8 + 0.2 * glowPulse), ep);
        m._g = lerp(m._g, sc.g * 0.5, ep);
        m._b = lerp(m._b, sc.b * 0.5, ep);
      }
    }
  }

  if (riseP > 0.5) {
    base.showLabel('mode-label', 'Mode Message Ring', 0, 3, -base.halfSize + 2);
  }
  if (infoP > 0.3) {
    base.showLabel('mode-info', 'Layers: 2 | Words: 5', 0, 4, base.halfSize - 2);
  }

  base.emitStageData('modeMessage', {
    layers: 2,
    codewords: 5,
    ringBits: 28
  });
}

// Stage 2: Data Layers — layers light up radiating outward, cursor spirals
function renderStage2(p, base) {
  const sc = STAGE_RGB[2]; // blue
  const readP = Math.max(0, Math.min(1, p / 0.9));
  const total = base._azDataIndices.length;

  let revealed;
  if (readP <= 0.2) {
    revealed = Math.floor((readP / 0.2) * total * 0.2);
  } else {
    const remaining = total - Math.floor(total * 0.2);
    revealed = Math.floor(total * 0.2 + ((readP - 0.2) / 0.8) * remaining);
  }
  revealed = Math.min(revealed, total);

  // Dim all data
  for (const m of base.modules) {
    if (m.cat === AZ_CAT_DATA) {
      m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
    }
  }

  // Light up read modules
  for (let i = 0; i < revealed; i++) {
    const idx = base._azDataIndices[i];
    const m = base.modules[idx];
    const age = revealed - i;
    const brightness = Math.max(0.3, 1 - age / 50);
    m._r = sc.r * brightness;
    m._g = sc.g * brightness;
    m._b = sc.b * brightness;
    m._y = brightness * 0.3;
  }

  // Cursor
  const extras = base.extras;
  if (revealed > 0 && revealed < total) {
    const curIdx = base._azDataIndices[Math.min(revealed, total - 1)];
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

  base.emitStageData('dataReading', {
    revealed, total,
    bitstream: ''
  });
}

// Stage 3: Error Correction
function renderStage3(p, base) {
  const separateP = Math.min(1, p / 0.3);
  const shieldP = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
  const returnP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  const dataColor = { r: 0.3, g: 0.59, b: 1.0 };
  const ecColor = { r: 1.0, g: 0.42, b: 0.42 };

  for (let i = 0; i < base._azDataIndices.length; i++) {
    const idx = base._azDataIndices[i];
    const m = base.modules[idx];
    const isData = i < base._azDataCodewordCount;

    if (separateP > 0) {
      const sep = easeOutCubic(separateP);
      const ret = returnP > 0 ? easeOutCubic(returnP) : 0;
      if (isData) {
        m._y = sep * 2.0 * (1 - ret);
        m._r = lerp(m._r, dataColor.r, sep);
        m._g = lerp(m._g, dataColor.g, sep);
        m._b = lerp(m._b, dataColor.b, sep);
      } else {
        m._y = sep * -1.0 * (1 - ret);
        m._r = lerp(m._r, ecColor.r, sep);
        m._g = lerp(m._g, ecColor.g, sep);
        m._b = lerp(m._b, ecColor.b, sep);
      }
    }
  }

  const extras = base.extras;
  if (shieldP > 0 && returnP < 1) {
    extras.shield.visible = true;
    const se = easeOutCubic(shieldP);
    extras.shield.material.opacity = se * 0.4 * (1 - returnP);
    extras.shield.scale.setScalar(0.5 + se * 0.5);
    extras.shield.rotation.y += 0.005;
  } else {
    extras.shield.visible = false;
  }

  if (separateP > 0.5) {
    base.showLabel('az-data-label', 'Data Codewords', 0, 3.5, 0, 'label-data');
    base.showLabel('az-ec-label', 'EC Codewords', 0, -0.5, 0, 'label-ec');
  }

  const dataBytes = Math.floor(base._azDataCodewordCount / 8);
  const ecBytes = Math.floor((base._azDataIndices.length - base._azDataCodewordCount) / 8);
  base.emitStageData('errorCorrection', {
    dataBytes, ecBytes, damaged: 0, repaired: 0
  });
}

// Distinct colors per decoded character
const CHAR_COLORS = [
  { r: 1.0, g: 0.40, b: 0.40 },
  { r: 0.40, g: 0.80, b: 1.0 },
  { r: 1.0, g: 0.75, b: 0.25 },
  { r: 0.55, g: 1.0, b: 0.55 },
  { r: 0.85, g: 0.50, b: 1.0 },
  { r: 1.0, g: 0.55, b: 0.20 },
  { r: 0.30, g: 1.0, b: 0.85 },
  { r: 1.0, g: 0.45, b: 0.70 },
];

// Stage 4: Final Decode
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
      if (moduleIdx < base._azDataIndices.length) {
        const idx = base._azDataIndices[moduleIdx];
        const m = base.modules[idx];
        m._r = cc.r * pulse;
        m._g = cc.g * pulse;
        m._b = cc.b * pulse;
        m._y = isCurrent ? 1.2 : 0.5;
        cx += (m.col - base.halfSize + 0.5);
        cz += (m.row - base.halfSize + 0.5);
        count++;

        if (isCurrent) {
          base.showLabel(`az-bit-${b}`, m.val ? '1' : '0',
            m.col - base.halfSize + 0.5, 2.0,
            m.row - base.halfSize + 0.5, 'label-bit');
        }
      }
    }

    if (isCurrent && count > 0) {
      cx /= count;
      cz /= count;
      base.showLabel('az-current-char', `"${char}"`, cx, 3.0, cz, 'label-char-big');
    }
  }

  if (charsRevealed > 0) {
    const decodedSoFar = text.substring(0, Math.min(charsRevealed, maxChars));
    base.showLabel('az-decoded-progress', decodedSoFar, 0, 4.5, 0, 'label-decoded');
  }

  if (currentCharIdx < 0 || revealP >= 1) {
    for (let b = 0; b < 8; b++) base.hideLabel(`az-bit-${b}`);
    base.hideLabel('az-current-char');
  }

  // Keep bullseye visible
  for (const m of base.modules) {
    if (m.cat === AZ_CAT_BULLSEYE && m.val) {
      m._r = Math.max(m._r, 0.25);
      m._g = Math.max(m._g, 0.25);
      m._b = Math.max(m._b, 0.28);
    }
  }

  if (finalP > 0) {
    base.showLabel('az-decoded-progress', `"${text}"`, 0, 5, 0, 'label-decoded');
    const dist = base.gridSize * 1.1;
    base.setCameraGoal(dist * 0.5, dist * 0.9, dist * 0.5, 0, 1, 0);
    for (let b = 0; b < 8; b++) base.hideLabel(`az-bit-${b}`);
    base.hideLabel('az-current-char');
  }

  base.emitStageData('decode', {
    table: decodeTable,
    fullText: charsRevealed >= maxChars ? text : null
  });
}
