import * as THREE from 'three';
import { easeOutCubic, lerp, hexToRgbNorm, BARCODE_STAGE_COLORS } from './barcode-helpers.js';

const STAGE_RGB = BARCODE_STAGE_COLORS.map(hexToRgbNorm);

// Distinct colors for each decoded character (H, E, L, L, O)
const CHAR_COLORS = [
  { r: 1.0, g: 0.40, b: 0.40 },  // red-ish for H
  { r: 0.40, g: 0.80, b: 1.0 },  // blue-ish for E
  { r: 1.0, g: 0.75, b: 0.25 },  // gold for L
  { r: 0.55, g: 1.0, b: 0.55 },  // green for L
  { r: 0.85, g: 0.50, b: 1.0 },  // purple for O
];

export const barcodeDelegate = {
  categorizeModules(vizData, base) {
    const encoded = vizData.encoded;
    const bars = encoded.totalBars;
    const totalWidth = bars.length; // one column per bar element
    const barHeight = vizData.barHeight || 16;
    const depth = 3; // bars have some depth (multiple rows in z)

    // gridSize for camera/scene sizing
    base.gridSize = Math.max(totalWidth + 4, 20);
    base.halfSize = base.gridSize / 2;

    const modules = [];

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const isGuard = bar.groupIndex === 0 || bar.groupIndex === encoded.chars.length - 1;
      const isCheck = encoded.chars[bar.groupIndex]?.groupLabel === 'Check';

      // Each bar/space element maps to depth rows of tiles in z
      for (let dz = 0; dz < depth; dz++) {
        modules.push({
          col: i,
          row: Math.floor((base.gridSize - depth) / 2) + dz,
          val: bar.isBar ? 1 : 0,
          isBar: bar.isBar,
          isGuard,
          isCheck,
          groupIndex: bar.groupIndex,
          groupLabel: bar.groupLabel,
          barWidth: bar.width,
          moduleIndex: i,
          barHeight, // target pillar height
          _y: 0,
          _scaleY: 1,
          _r: 0, _g: 0, _b: 0,
        });
      }
    }

    // Store info for stages
    base._barcodeEncoded = encoded;
    base._barcodeGroupCount = encoded.chars.length;
    base._barDepth = depth;
    base._barCount = bars.length;

    return modules;
  },

  setupExtras(scene, gridSize, halfSize) {
    // Scanner laser line
    const laserGeo = new THREE.BoxGeometry(gridSize * 0.8, 0.15, 4);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff0000, transparent: true, opacity: 0
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.y = 4;
    laser.visible = false;
    scene.add(laser);

    // Quiet zone planes
    const qzGeo = new THREE.PlaneGeometry(3, 8);
    const qzMat = new THREE.MeshBasicMaterial({
      color: 0x4d96ff, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const qzLeft = new THREE.Mesh(qzGeo, qzMat.clone());
    qzLeft.rotation.y = Math.PI / 2;
    qzLeft.visible = false;
    scene.add(qzLeft);

    const qzRight = new THREE.Mesh(qzGeo, qzMat.clone());
    qzRight.rotation.y = Math.PI / 2;
    qzRight.visible = false;
    scene.add(qzRight);

    return { laser, qzLeft, qzRight };
  },

  hideExtras(extras) {
    if (!extras) return;
    extras.laser.visible = false;
    extras.laser.material.opacity = 0;
    extras.qzLeft.visible = false;
    extras.qzRight.visible = false;
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
    // Set base colors for all modules
    for (const m of base.modules) {
      if (m.val) {
        m._r = 0.78; m._g = 0.8; m._b = 0.84;
      } else {
        m._r = 0.18; m._g = 0.19; m._b = 0.22;
      }
      m._scaleY = 1;
    }

    switch (step) {
      case 0: renderStage0(p, base); break;
      case 1: renderStage1(p, base); break;
      case 2: renderStage2(p, base); break;
      case 3: renderStage3(p, base); break;
      case 4: renderStage4(p, base); break;
    }
  }
};

// Helper: get column position in world space
function colToWorld(col, base) {
  return col - base.halfSize + 0.5;
}

// Helper: iterate only unique bar columns (first module per column)
function forEachBar(base, fn) {
  const depth = base._barDepth;
  for (let i = 0; i < base.modules.length; i += depth) {
    fn(base.modules[i], i, i / depth);
  }
}

// Helper: set properties on all depth modules for a bar column
function setBarColumn(base, barModuleIndex, props) {
  const depth = base._barDepth;
  const startIdx = Math.floor(barModuleIndex / depth) * depth;
  for (let d = 0; d < depth; d++) {
    const m = base.modules[startIdx + d];
    if (m) Object.assign(m, props);
  }
}

// Helper: set props on all modules matching a column index
function setBarByCol(base, colIdx, props) {
  const depth = base._barDepth;
  const startIdx = colIdx * depth;
  for (let d = 0; d < depth; d++) {
    const m = base.modules[startIdx + d];
    if (m) Object.assign(m, props);
  }
}

// Stage 0: Bar Structure — bars rise left-to-right as pillars, guards glow
function renderStage0(p, base) {
  const sc = STAGE_RGB[0]; // blue
  const riseP = Math.min(1, p / 0.6);
  const guardP = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
  const qzP = Math.max(0, Math.min(1, (p - 0.7) / 0.3));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
  const barCount = base._barCount;

  for (const m of base.modules) {
    const colFraction = m.moduleIndex / barCount;
    const delay = colFraction * 0.7;
    const localP = Math.max(0, Math.min(1, (riseP - delay) / (1 - delay)));
    const ep = easeOutCubic(localP);

    // Bars rise tall, spaces stay low
    if (m.isBar) {
      const targetHeight = m.barWidth * 8 + 30; // tall pillars based on bar width
      m._scaleY = lerp(1, targetHeight, ep);
      m._y = m._scaleY * 0.09; // half of 0.18 geometry height * scaleY
    } else {
      m._scaleY = 1;
      m._y = 0;
    }

    // Guard bars glow
    if (m.isGuard && guardP > 0 && m.isBar) {
      const glow = guardP * (0.8 + 0.2 * glowPulse);
      m._r = lerp(m._r, sc.r * glow, guardP);
      m._g = lerp(m._g, sc.g * glow, guardP);
      m._b = lerp(m._b, sc.b * glow, guardP);
      m._scaleY *= (1 + guardP * 0.15);
      m._y = m._scaleY * 0.09;
    }
  }

  // Quiet zone planes
  if (qzP > 0) {
    const extras = base.extras;
    const leftX = colToWorld(0, base) - 2;
    const rightX = colToWorld(barCount - 1, base) + 2;
    extras.qzLeft.visible = true;
    extras.qzLeft.position.set(leftX, 3, 0);
    extras.qzLeft.material.opacity = qzP * 0.2;
    extras.qzRight.visible = true;
    extras.qzRight.position.set(rightX, 3, 0);
    extras.qzRight.material.opacity = qzP * 0.2;
  }

  // Labels
  if (guardP > 0.5) {
    base.showLabel('start-guard', 'Start Guard', colToWorld(2, base), 8, 0);
    base.showLabel('stop-guard', 'Stop Guard', colToWorld(barCount - 3, base), 8, 0);
  }
  if (qzP > 0.5) {
    base.showLabel('qz-label', 'Quiet Zone', colToWorld(barCount / 2, base), 9, 0);
  }

  base.emitStageData('structure', {
    totalBars: barCount,
    characters: base._barcodeEncoded.text.length,
    type: 'Code 128B'
  });
}

// Stage 1: Width Encoding — character groups highlight in sequence
function renderStage1(p, base) {
  const groupCount = base._barcodeGroupCount;
  const highlightGroup = Math.floor(p * groupCount * 1.3);

  // First raise all bars to pillar height
  for (const m of base.modules) {
    if (m.isBar) {
      m._scaleY = m.barWidth * 8 + 30;
      m._y = m._scaleY * 0.09;
    }
  }

  // Highlight active group
  for (const m of base.modules) {
    if (m.groupIndex === highlightGroup || m.groupIndex === highlightGroup - 1) {
      const gc = STAGE_RGB[m.groupIndex % STAGE_RGB.length];
      const intensity = m.groupIndex === highlightGroup ? 1.0 : 0.4;
      if (m.isBar) {
        m._r = lerp(m._r, gc.r, intensity);
        m._g = lerp(m._g, gc.g, intensity);
        m._b = lerp(m._b, gc.b, intensity);
      }
      // Raise current group higher
      if (m.groupIndex === highlightGroup && m.isBar) {
        m._scaleY *= 1.15;
        m._y = m._scaleY * 0.09;
      }
    } else {
      // Dim non-active groups
      m._r *= 0.5;
      m._g *= 0.5;
      m._b *= 0.5;
    }
  }

  // Show width pattern label above current group
  if (highlightGroup < groupCount) {
    const groupModules = base.modules.filter(
      m => m.groupIndex === highlightGroup && m.row === base.modules[0].row
    );
    if (groupModules.length > 0) {
      const centerCol = groupModules.reduce((s, m) => s + m.col, 0) / groupModules.length;
      const widths = groupModules.map(m => m.barWidth).join('-');
      const label = base._barcodeEncoded.chars[highlightGroup]?.groupLabel || '?';
      base.showLabel('width-pattern', `"${label}" [${widths}]`, colToWorld(centerCol, base), 10, 0);
    }
  }

  base.emitStageData('encoding', {
    currentGroup: Math.min(highlightGroup, groupCount - 1),
    totalGroups: groupCount,
    currentChar: base._barcodeEncoded.chars[Math.min(highlightGroup, groupCount - 1)]?.groupLabel || ''
  });
}

// Stage 2: Scanner Sweep — red laser line sweeps across
function renderStage2(p, base) {
  const sweepP = Math.max(0, Math.min(1, p / 0.8));
  const fadeP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));
  const barCount = base._barCount;

  const leftX = colToWorld(0, base) - 2;
  const rightX = colToWorld(barCount - 1, base) + 2;
  const laserX = lerp(leftX, rightX, sweepP);

  // Raise all bars
  for (const m of base.modules) {
    if (m.isBar) {
      m._scaleY = m.barWidth * 8 + 30;
      m._y = m._scaleY * 0.09;
    }
  }

  // Show laser
  const extras = base.extras;
  extras.laser.visible = true;
  extras.laser.position.x = laserX;
  extras.laser.position.y = 3;
  extras.laser.material.opacity = (1 - fadeP) * 0.8;

  // Light up bars as laser passes
  for (const m of base.modules) {
    const worldX = colToWorld(m.col, base);
    if (worldX < laserX && m.isBar) {
      const dist = laserX - worldX;
      const brightness = Math.max(0.3, 1 - dist / 12);
      m._r = lerp(m._r, 1.0, brightness);
      m._g = lerp(m._g, 0.2, brightness);
      m._b = lerp(m._b, 0.2, brightness);
    }
  }

  // Show bits near laser (only for first row to avoid duplicates)
  const firstRow = base.modules[0]?.row;
  const nearModules = base.modules.filter(
    m => m.row === firstRow && Math.abs(colToWorld(m.col, base) - laserX) < 2
  );
  for (let i = 0; i < Math.min(4, nearModules.length); i++) {
    const m = nearModules[i];
    base.showLabel(`scan-bit-${i}`, m.isBar ? '1' : '0', colToWorld(m.col, base), 6, 0, 'label-bit');
  }

  base.emitStageData('scanning', {
    progress: Math.floor(sweepP * 100),
    barsRead: base.modules.filter(m => m.row === firstRow && colToWorld(m.col, base) < laserX).length,
    totalBars: barCount
  });
}

// Stage 3: Check Digit — check group highlights, calculation shown
function renderStage3(p, base) {
  const calcP = Math.min(1, p / 0.5);
  const verifyP = Math.max(0, Math.min(1, (p - 0.5) / 0.3));
  const flashP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  const checkGroupIdx = base._barcodeGroupCount - 2; // Check is second to last

  // Raise all bars
  for (const m of base.modules) {
    if (m.isBar) {
      m._scaleY = m.barWidth * 8 + 30;
      m._y = m._scaleY * 0.09;
    }
  }

  for (const m of base.modules) {
    if (m.groupIndex === checkGroupIdx && m.isBar) {
      // Check digit group — rises higher and glows
      m._scaleY *= (1 + calcP * 0.3);
      m._y = m._scaleY * 0.09;

      if (flashP > 0) {
        // Green flash = pass
        m._r = lerp(1.0, 0.3, flashP);
        m._g = lerp(0.85, 0.9, flashP);
        m._b = lerp(0.24, 0.4, flashP);
      } else {
        m._r = 1.0; m._g = 0.85; m._b = 0.24; // yellow during calc
      }
    }
  }

  // Labels
  if (calcP > 0.3) {
    const firstRow = base.modules[0]?.row;
    const checkModules = base.modules.filter(m => m.groupIndex === checkGroupIdx && m.row === firstRow);
    if (checkModules.length > 0) {
      const cx = checkModules.reduce((s, m) => s + colToWorld(m.col, base), 0) / checkModules.length;
      base.showLabel('check-label', `Check Digit: ${base._barcodeEncoded.checkDigit}`, cx, 10, 0);
    }
  }
  if (flashP > 0.5) {
    base.showLabel('verify-label', 'Verified!', 0, 11, 0, 'label-success');
  }

  base.emitStageData('checkDigit', {
    checkValue: base._barcodeEncoded.checkDigit,
    verified: flashP > 0.5,
    formula: 'Sum(value x position) mod 103'
  });
}

// Stage 4: Final Decode — each character's bars light up with unique color,
// labels show which segments decode to which character
function renderStage4(p, base) {
  const text = base.data.decodedText;
  const charCount = text.length;

  // Timing: reveal one character at a time
  const revealP = Math.min(1, p / 0.65);
  const charsRevealed = Math.floor(revealP * (charCount + 0.999));
  const assembleP = Math.max(0, Math.min(1, (p - 0.55) / 0.25));
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  // Raise all bars to pillar height
  for (const m of base.modules) {
    if (m.isBar) {
      m._scaleY = m.barWidth * 8 + 30;
      m._y = m._scaleY * 0.09;
    }
  }

  // Dim everything first
  for (const m of base.modules) {
    m._r *= 0.35;
    m._g *= 0.35;
    m._b *= 0.35;
  }

  const firstRow = base.modules[0]?.row;
  const decodeTable = [];

  // Color each revealed character's bar group
  for (let i = 0; i < Math.min(charsRevealed, charCount); i++) {
    const groupIdx = i + 1; // +1 because index 0 is Start
    const cc = CHAR_COLORS[i % CHAR_COLORS.length];

    // Is this the currently-revealing character? (animate it)
    const isCurrent = (i === Math.min(charsRevealed, charCount) - 1) && revealP < 1;
    const pulse = isCurrent ? (0.8 + 0.2 * Math.sin(performance.now() * 0.008)) : 1.0;

    for (const m of base.modules) {
      if (m.groupIndex === groupIdx) {
        if (m.isBar) {
          m._r = cc.r * pulse;
          m._g = cc.g * pulse;
          m._b = cc.b * pulse;
          // Make current character's bars taller
          if (isCurrent) {
            m._scaleY *= 1.2;
            m._y = m._scaleY * 0.09;
          }
        } else {
          // Spaces in this group: subtle tint
          m._r = cc.r * 0.15;
          m._g = cc.g * 0.15;
          m._b = cc.b * 0.15;
        }
      }
    }

    const char = text[i];
    const charCode = char.charCodeAt(0);
    decodeTable.push({
      binary: charCode.toString(2).padStart(8, '0'),
      hex: '0x' + charCode.toString(16).toUpperCase().padStart(2, '0'),
      char
    });

    // Show character label above its bar group
    const groupModules = base.modules.filter(
      m => m.groupIndex === groupIdx && m.row === firstRow
    );
    if (groupModules.length > 0) {
      const centerCol = groupModules.reduce((s, m) => s + m.col, 0) / groupModules.length;
      const wx = colToWorld(centerCol, base);
      const barScales = groupModules.filter(m => m.isBar).map(m => m._scaleY);
      const maxScale = barScales.length > 0 ? Math.max(...barScales) : 30;
      const labelY = maxScale * 0.18 + 1.5;

      // Show 0/1 on each bar/space of the current character
      if (isCurrent) {
        for (let gi = 0; gi < groupModules.length; gi++) {
          const gm = groupModules[gi];
          base.showLabel(`bar-bit-${gi}`, gm.isBar ? '1' : '0',
            colToWorld(gm.col, base), labelY - 0.5, 0, 'label-bit');
        }
      }

      // Show "these bars = H" style label
      const widths = groupModules.map(m => m.barWidth).join('-');
      base.showLabel(
        `char-decode-${i}`,
        `[${widths}] = "${char}"`,
        wx, labelY, 0,
        'label-char-decode'
      );

      // Also show the big character letter above
      if (assembleP > 0) {
        base.showLabel(
          `char-big-${i}`,
          char,
          wx, labelY + 2.0, 0,
          'label-char-big'
        );
      }
    }
  }

  // Also keep guard bars visible (dimmed)
  for (const m of base.modules) {
    if (m.isGuard && m.isBar) {
      m._r = Math.max(m._r, 0.3);
      m._g = Math.max(m._g, 0.3);
      m._b = Math.max(m._b, 0.35);
    }
  }

  // Final decoded string label
  if (finalP > 0) {
    base.showLabel('decoded-text', `"${text}"`, 0, 14, 0, 'label-decoded');
    const dist = base.gridSize * 0.6;
    base.setCameraGoal(0, dist * 1.1, dist * 0.9, 0, 3, 0);
  }

  base.emitStageData('decode', {
    table: decodeTable,
    fullText: charsRevealed >= charCount ? text : null
  });
}
