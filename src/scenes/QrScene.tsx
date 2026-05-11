import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { QrVizData } from '@/lib/codes/types';
import {
  categorizeQr,
  QrCat,
  type QrCategorized,
  type QrModule,
} from '@/lib/codes/qr/categorize';
import { easeOutCubic, lerp, MASK_FORMULAS } from '@/lib/codes/qr/helpers';
import { QR_STAGES } from '@/lib/codes/qr/config';
import {
  ACCENT_HEX,
  ACCENT_RGB,
  ACCENT_STRONG_RGB,
  CREAM_RGB,
  WARN_RGB,
} from '@/lib/codes/accents';
import { InstancedGrid } from '@/lib/three/InstancedGrid';
import { CameraRig, type CameraGoal } from '@/lib/three/CameraRig';
import { SceneEnvironment } from '@/lib/three/SceneEnvironment';
import { StageLabels, type LabelSpec } from '@/lib/three/StageLabels';
import { useStageAnimator } from '@/lib/three/useStageAnimator';

// Single accent per code type. Stages are distinguished by motion, glow
// intensity, and the auxiliary colors (cream for "decoded", warn for error-
// correction), not by 5 unrelated hues. See plan §"Visual design".
const QR_ACCENT = ACCENT_RGB.qr;
const QR_ACCENT_STRONG = ACCENT_STRONG_RGB.qr;
const QR_ACCENT_HEX = ACCENT_HEX.qr;

const TRAIL_CAPACITY = 600;

export interface QrStageData {
  type: 'structure' | 'format' | 'dataReading' | 'errorCorrection' | 'decode';
  payload: unknown;
}

interface Props {
  viz: QrVizData;
  stage: number;
  autoPlay: boolean;
  onAdvance: (newStage: number) => void;
  onStageData?: (data: QrStageData) => void;
}

export function QrScene({
  viz,
  stage,
  autoPlay,
  onAdvance,
  onStageData,
}: Props) {
  const categorized = useMemo(() => categorizeQr(viz), [viz]);
  const modulesRef = useRef<QrModule[]>(categorized.modules);

  // Re-seed the modules ref when the data changes.
  useEffect(() => {
    modulesRef.current = categorized.modules;
  }, [categorized]);

  // Default camera goal — front-facing, slight 3/4 angle for depth.
  // The world group is rotated +90° about X (see <group> in render), so what
  // was the "floor" plane now stands upright in front of the camera.
  const defaultGoal = useMemo<CameraGoal>(() => {
    const dist = viz.gridSize * 2.0;
    return {
      position: [dist * 0.09, dist * 0.05, dist * 0.99],
      target: [0, 0, 0],
    };
  }, [viz.gridSize]);

  const cameraGoalRef = useRef<CameraGoal>({
    position: [...defaultGoal.position] as [number, number, number],
    target: [...defaultGoal.target] as [number, number, number],
  });

  // Reset camera goal when grid size changes.
  useEffect(() => {
    cameraGoalRef.current.position = [...defaultGoal.position] as [
      number,
      number,
      number,
    ];
    cameraGoalRef.current.target = [...defaultGoal.target] as [
      number,
      number,
      number,
    ];
  }, [defaultGoal]);

  // Labels: stored as state but only set when the snapshot key changes.
  const [labels, setLabels] = useState<LabelSpec[]>([]);
  const labelsKeyRef = useRef('');

  // Extras refs — direct three.js handles for the mask plane, cursor, shield.
  const maskPlaneRef = useRef<THREE.Mesh>(null);
  const cursorRef = useRef<THREE.Mesh>(null);
  const shieldRef = useRef<THREE.Mesh>(null);

  // Trail line is built imperatively so we can mutate the position buffer.
  const trail = useMemo(() => {
    const positions = new Float32Array(TRAIL_CAPACITY * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({
      color: QR_ACCENT_HEX,
      transparent: true,
      opacity: 0.35,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    return { line, positions, geometry: geo, material: mat };
  }, []);

  // Dispose trail resources on unmount.
  useEffect(() => {
    const captured = trail;
    return () => {
      captured.geometry.dispose();
      captured.material.dispose();
    };
  }, [trail]);

  // Last emitted stage-data key to dedupe.
  const stageDataKeyRef = useRef('');
  const emitStageData = (data: QrStageData) => {
    if (!onStageData) return;
    const key = data.type + JSON.stringify(data.payload);
    if (key === stageDataKeyRef.current) return;
    stageDataKeyRef.current = key;
    onStageData(data);
  };

  // On stage change: reset visuals + labels + camera.
  useEffect(() => {
    setLabels([]);
    labelsKeyRef.current = '';
    stageDataKeyRef.current = '';
    if (maskPlaneRef.current) maskPlaneRef.current.visible = false;
    if (cursorRef.current) cursorRef.current.visible = false;
    if (shieldRef.current) {
      shieldRef.current.visible = false;
      (shieldRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    trail.line.visible = false;
    trail.geometry.setDrawRange(0, 0);
    cameraGoalRef.current.position = [...defaultGoal.position] as [
      number,
      number,
      number,
    ];
    cameraGoalRef.current.target = [...defaultGoal.target] as [
      number,
      number,
      number,
    ];
  }, [stage, defaultGoal, trail]);

  // Stage progress animator.
  const progressRef = useStageAnimator({
    stage,
    stageCount: QR_STAGES.length,
    durations: QR_STAGES.map((s) => s.duration),
    autoPlay,
    onAdvance,
  });

  // Per-frame render.
  useFrame(() => {
    const p = progressRef.current;
    if (!p) return;
    const modules = modulesRef.current;
    setDefaultColors(modules);

    const ctx: RenderCtx = {
      modules,
      categorized,
      viz,
      eased: p.eased,
      raw: p.progress,
      halfSize: viz.gridSize / 2,
      extras: {
        maskPlane: maskPlaneRef.current,
        cursor: cursorRef.current,
        shield: shieldRef.current,
        trailLine: trail.line,
        trailPositions: trail.positions,
        trailGeometry: trail.geometry,
      },
      cameraGoalRef,
      defaultGoal,
      emit: emitStageData,
    };

    let nextLabels: LabelSpec[];
    switch (p.stage) {
      case 0: nextLabels = renderStage0(ctx); break;
      case 1: nextLabels = renderStage1(ctx); break;
      case 2: nextLabels = renderStage2(ctx); break;
      case 3: nextLabels = renderStage3(ctx); break;
      case 4: nextLabels = renderStage4(ctx); break;
      default: nextLabels = [];
    }

    // Only commit labels when something actually changed (cheap key check).
    const key = labelsKey(nextLabels);
    if (key !== labelsKeyRef.current) {
      labelsKeyRef.current = key;
      setLabels(nextLabels);
    }
  });

  return (
    <>
      <SceneEnvironment />
      <CameraRig goalRef={cameraGoalRef} />

      {/* Rotate +90° about X so the grid stands up vertically facing the
          camera. All children — modules, labels, extras — share this
          transform so legacy XZ-plane coordinates "just work". */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <InstancedGrid modulesRef={modulesRef} gridSize={viz.gridSize} />
        <StageLabels labels={labels} />

        {/* Mask peel plane — visible during stage 1 */}
        <mesh
          ref={maskPlaneRef}
          position={[0, 3, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <planeGeometry args={[viz.gridSize - 2, viz.gridSize - 2]} />
          <meshBasicMaterial
            color={QR_ACCENT_HEX}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Read cursor — visible during stage 2 */}
        <mesh ref={cursorRef} visible={false}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshBasicMaterial color={QR_ACCENT_HEX} transparent opacity={0.9} />
        </mesh>

        {/* Read trail (imperative line) */}
        <primitive object={trail.line} />

        {/* Error-correction shield — visible during stage 3 */}
        <mesh ref={shieldRef} position={[0, 2, 0]} visible={false}>
          <icosahedronGeometry args={[viz.gridSize * 0.4, 2]} />
          <meshBasicMaterial
            color={QR_ACCENT_HEX}
            transparent
            opacity={0}
            wireframe
          />
        </mesh>
      </group>
    </>
  );
}

// =================================================================
// Per-frame helpers
// =================================================================

interface RenderCtx {
  modules: QrModule[];
  categorized: QrCategorized;
  viz: QrVizData;
  eased: number;
  raw: number;
  halfSize: number;
  extras: {
    maskPlane: THREE.Mesh | null;
    cursor: THREE.Mesh | null;
    shield: THREE.Mesh | null;
    trailLine: THREE.Line;
    trailPositions: Float32Array;
    trailGeometry: THREE.BufferGeometry;
  };
  cameraGoalRef: React.RefObject<CameraGoal>;
  defaultGoal: CameraGoal;
  emit: (data: QrStageData) => void;
}

function setDefaultColors(modules: QrModule[]): void {
  for (const m of modules) {
    if (m.val) {
      m._r = 0.78; m._g = 0.8; m._b = 0.84;
    } else {
      m._r = 0.1; m._g = 0.11; m._b = 0.14;
    }
    m._y = 0;
    m._scaleY = 1;
  }
}

function labelsKey(labels: LabelSpec[]): string {
  let out = '';
  for (const l of labels) {
    out += `${l.id}|${l.text}|${l.position[0].toFixed(2)},${l.position[1].toFixed(2)},${l.position[2].toFixed(2)}|${l.variant ?? 'd'}||`;
  }
  return out;
}

// -----------------------------------------------------------------
// Stage 0 — Structure
// -----------------------------------------------------------------

function renderStage0(ctx: RenderCtx): LabelSpec[] {
  const { modules, viz, halfSize, categorized, emit } = ctx;
  const p = ctx.eased;
  const sc = QR_ACCENT;
  const cream = CREAM_RGB;

  const fadeIn = Math.min(1, p / 0.15);
  const finderP = Math.max(0, Math.min(1, (p - 0.15) / 0.35));
  const timingP = Math.max(0, Math.min(1, (p - 0.5) / 0.2));
  const alignP = Math.max(0, Math.min(1, (p - 0.7) / 0.15));
  const labelP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  for (const m of modules) {
    if (m.val) {
      m._r = 0.78 * fadeIn; m._g = 0.8 * fadeIn; m._b = 0.84 * fadeIn;
    } else {
      m._r = 0.1 * fadeIn; m._g = 0.11 * fadeIn; m._b = 0.14 * fadeIn;
    }

    if (m.cat === QrCat.Finder && finderP > 0) {
      let delay = 0;
      if (m.row < 7 && m.col >= viz.gridSize - 7) delay = 0.4;
      if (m.row >= viz.gridSize - 7) delay = 0.75;
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

    if (m.cat === QrCat.Timing && timingP > 0) {
      const ep = easeOutCubic(timingP);
      m._y = ep * 1.0;
      if (m.val) {
        m._r = lerp(m._r, cream.r, ep);
        m._g = lerp(m._g, cream.g, ep);
        m._b = lerp(m._b, cream.b, ep);
      }
    }

    if (m.cat === QrCat.Alignment && alignP > 0) {
      const ep = easeOutCubic(alignP);
      m._y = ep * 1.5;
      if (m.val) {
        // alignment uses accent-strong for differentiation
        m._r = lerp(m._r, QR_ACCENT_STRONG.r, ep);
        m._g = lerp(m._g, QR_ACCENT_STRONG.g, ep);
        m._b = lerp(m._b, QR_ACCENT_STRONG.b, ep);
      }
    }
  }

  const labels: LabelSpec[] = [];
  if (labelP > 0) {
    labels.push(
      { id: 'tl-finder', text: 'Finder', position: [-halfSize + 3.5, 3.5, -halfSize + 3.5] },
      { id: 'tr-finder', text: 'Finder', position: [halfSize - 3.5, 3.5, -halfSize + 3.5] },
      { id: 'bl-finder', text: 'Finder', position: [-halfSize + 3.5, 3.5, halfSize - 3.5] },
      { id: 'timing', text: 'Timing', position: [0, 2.2, -halfSize + 6.5] },
    );
    if (categorized.alignPositions.length > 0) {
      const ac = 18 - halfSize + 0.5;
      labels.push({ id: 'alignment', text: 'Alignment', position: [ac, 3, ac] });
    }
  }

  emit({
    type: 'structure',
    payload: {
      gridSize: viz.gridSize,
      version: viz.version,
      finderCount: 3,
      hasAlignment: categorized.alignPositions.length > 0,
    },
  });

  return labels;
}

// -----------------------------------------------------------------
// Stage 1 — Format & Mask
// -----------------------------------------------------------------

function renderStage1(ctx: RenderCtx): LabelSpec[] {
  const { modules, viz, halfSize, categorized, extras, emit } = ctx;
  const p = ctx.eased;
  const sc = QR_ACCENT;

  const formatP = Math.min(1, p / 0.3);
  const maskAppearP = Math.max(0, Math.min(1, (p - 0.3) / 0.2));
  const maskPeelP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const flashP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  for (const m of modules) {
    if (m.cat === QrCat.Format && formatP > 0) {
      const ep = easeOutCubic(formatP);
      m._y = ep * 1.5;
      m._r = lerp(m._r, sc.r, ep);
      m._g = lerp(m._g, sc.g, ep);
      m._b = lerp(m._b, sc.b, ep);
    }
    if (m.cat === QrCat.Data && flashP > 0) {
      const unmasked = categorized.unmaskedGrid[m.row][m.col];
      if (unmasked !== m.val) {
        const flash = Math.sin(flashP * Math.PI * 4) * 0.5 + 0.5;
        m._r = lerp(m._r, 1.0, flash * flashP);
        m._g = lerp(m._g, 1.0, flash * flashP);
        m._b = lerp(m._b, 1.0, flash * flashP);
      }
    }
  }

  const mask = extras.maskPlane;
  if (mask) {
    if (maskAppearP > 0 && maskPeelP < 1) {
      mask.visible = true;
      const mat = mask.material as THREE.MeshBasicMaterial;
      if (maskPeelP > 0) {
        const peelEased = maskPeelP;
        mask.position.set(peelEased * viz.gridSize, 3, 0);
        mask.rotation.set(-Math.PI / 2 + peelEased * 0.3, peelEased * Math.PI * 0.3, 0);
        mat.opacity = 0.35 * (1 - peelEased);
      } else {
        mask.position.set(0, 3, 0);
        mask.rotation.set(-Math.PI / 2, 0, 0);
        mat.opacity = easeOutCubic(maskAppearP) * 0.35;
      }
    } else {
      mask.visible = false;
    }
  }

  const labels: LabelSpec[] = [];
  if (formatP > 0.5) {
    labels.push(
      { id: 'format-bits', text: '15 Format Bits', position: [-halfSize + 8, 2.8, -halfSize + 4] },
      {
        id: 'format-info',
        text: `EC ${viz.formatInfo.errorCorrectionLevel} · Mask ${viz.formatInfo.maskPattern}`,
        position: [0, 2.8, -halfSize - 1],
      },
    );
  }
  if (maskAppearP > 0.3 && maskPeelP < 0.5) {
    labels.push({ id: 'mask-label', text: 'Mask Pattern', position: [0, 4, 0] });
  }

  emit({
    type: 'format',
    payload: {
      ecLevel: viz.formatInfo.errorCorrectionLevel,
      maskPattern: viz.formatInfo.maskPattern,
      maskFormula: MASK_FORMULAS[viz.formatInfo.maskPattern] ?? '',
      rawBits: viz.formatInfo.raw,
      xorMask: 0x5412,
    },
  });

  return labels;
}

// -----------------------------------------------------------------
// Stage 2 — Data Reading
// -----------------------------------------------------------------

function renderStage2(ctx: RenderCtx): LabelSpec[] {
  const { modules, categorized, halfSize, extras, cameraGoalRef, defaultGoal, emit } = ctx;
  const p = ctx.eased;
  const sc = QR_ACCENT;

  const readP = Math.max(0, Math.min(1, p / 0.9));
  const pullbackP = Math.max(0, Math.min(1, (p - 0.9) / 0.1));

  if (pullbackP > 0) {
    cameraGoalRef.current.position = [...defaultGoal.position];
    cameraGoalRef.current.target = [...defaultGoal.target];
  }

  const totalModules = categorized.dataModuleIndices.length;
  let revealed: number;
  if (readP <= 0) {
    revealed = 0;
  } else {
    const threshold = 0.2;
    const normalCount = Math.floor(totalModules * 0.2);
    if (readP <= threshold) {
      revealed = Math.floor((readP / threshold) * normalCount);
    } else {
      const remaining = totalModules - normalCount;
      const acc = (readP - threshold) / (1 - threshold);
      revealed = normalCount + Math.floor(acc * remaining);
    }
  }
  revealed = Math.min(revealed, totalModules);

  // Dim all data modules first.
  for (const m of modules) {
    if (m.cat === QrCat.Data) {
      m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
    }
  }

  const trailStart = Math.max(0, revealed - 60);
  let trailCount = 0;
  const trailPos = extras.trailPositions;

  for (let i = 0; i < revealed && i < totalModules; i++) {
    const idx = categorized.dataModuleIndices[i];
    const m = modules[idx];
    const age = revealed - i;
    const brightness = Math.max(0.3, 1 - age / 70);
    m._r = sc.r * brightness;
    m._g = sc.g * brightness;
    m._b = sc.b * brightness;
    m._y = brightness * 0.3;

    if (i >= trailStart && trailCount < TRAIL_CAPACITY - 1) {
      trailPos[trailCount * 3] = m.col - halfSize + 0.5;
      trailPos[trailCount * 3 + 1] = m._y + 0.2;
      trailPos[trailCount * 3 + 2] = m.row - halfSize + 0.5;
      trailCount++;
    }
  }

  const trailLine = extras.trailLine;
  if (trailCount > 1) {
    trailLine.visible = true;
    extras.trailGeometry.attributes.position.needsUpdate = true;
    extras.trailGeometry.setDrawRange(0, trailCount);
  } else {
    trailLine.visible = false;
  }

  const cursor = extras.cursor;
  if (cursor) {
    if (revealed > 0 && revealed < totalModules) {
      const curIdx = categorized.dataModuleIndices[Math.min(revealed, totalModules - 1)];
      const cm = modules[curIdx];
      cursor.visible = true;
      cursor.position.set(
        cm.col - halfSize + 0.5,
        0.5,
        cm.row - halfSize + 0.5,
      );
      const pulse = 0.35 + 0.15 * Math.sin(performance.now() * 0.008);
      cursor.scale.setScalar(pulse / 0.45);
    } else {
      cursor.visible = false;
    }
  }

  // Floating bit labels for the last few read modules.
  const labels: LabelSpec[] = [];
  const labelCount = Math.min(6, revealed);
  for (let i = 0; i < labelCount; i++) {
    const readIdx = revealed - labelCount + i;
    if (readIdx < 0 || readIdx >= totalModules) continue;
    const idx = categorized.dataModuleIndices[readIdx];
    const m = modules[idx];
    const bitVal = categorized.unmaskedGrid[m.row][m.col];
    labels.push({
      id: `bit-${i}`,
      text: bitVal.toString(),
      position: [m.col - halfSize + 0.5, 1.2, m.row - halfSize + 0.5],
      variant: 'bit',
    });
  }

  let bits = '';
  const bitsToShow = Math.min(revealed, totalModules);
  for (let i = 0; i < Math.min(bitsToShow, 64); i++) {
    const idx = categorized.dataModuleIndices[i];
    const m = modules[idx];
    bits += categorized.unmaskedGrid[m.row][m.col];
    if ((i + 1) % 8 === 0 && i < 63) bits += ' ';
  }

  emit({
    type: 'dataReading',
    payload: { revealed, total: totalModules, bitstream: bits },
  });

  return labels;
}

// -----------------------------------------------------------------
// Stage 3 — Error Correction
// -----------------------------------------------------------------

function renderStage3(ctx: RenderCtx): LabelSpec[] {
  const { modules, categorized, halfSize, extras, emit } = ctx;
  const p = ctx.eased;

  const separateP = Math.min(1, p / 0.25);
  const shieldP = Math.max(0, Math.min(1, (p - 0.25) / 0.25));
  const damageP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const returnP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  const dataColor = QR_ACCENT;
  const ecColor = WARN_RGB;
  let damagedCount = 0;
  let repairedCount = 0;

  for (let i = 0; i < categorized.dataModuleIndices.length; i++) {
    const idx = categorized.dataModuleIndices[i];
    const m = modules[idx];
    const isData = i < categorized.dataCodewordCount;

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

  const shield = extras.shield;
  if (shield) {
    if (shieldP > 0 && returnP < 1) {
      shield.visible = true;
      const sm = shield.material as THREE.MeshBasicMaterial;
      const shieldEased = easeOutCubic(shieldP);
      sm.opacity = shieldEased * 0.45 * (1 - returnP);
      shield.scale.setScalar(0.5 + shieldEased * 0.5);
      shield.rotation.y += 0.005;
    } else {
      shield.visible = false;
    }
  }

  const labels: LabelSpec[] = [];
  if (separateP > 0.5) {
    labels.push(
      {
        id: 'data-label',
        text: `Data (${Math.floor(categorized.dataCodewordCount / 8)} bytes)`,
        position: [0, 3.5, 0],
        variant: 'data',
      },
      { id: 'ec-label', text: 'Error correction', position: [0, -0.5, 0], variant: 'ec' },
    );
  }
  if (damageP > 0.3 && damageP < 0.7) {
    labels.push({
      id: 'damage-label',
      text: 'Damage detected',
      position: [-halfSize, 4, 0],
      variant: 'warn',
    });
  }
  if (damageP > 0.7) {
    labels.push({
      id: 'repair-label',
      text: 'Repaired!',
      position: [-halfSize, 4, 0],
      variant: 'success',
    });
  }

  const dataBytes = Math.floor(categorized.dataCodewordCount / 8);
  const ecBytes = Math.floor(
    (categorized.dataModuleIndices.length - categorized.dataCodewordCount) / 8,
  );
  emit({
    type: 'errorCorrection',
    payload: {
      dataBytes,
      ecBytes,
      damaged: damageP > 0.1 ? damagedCount : 0,
      repaired: damageP > 0.5 ? repairedCount : 0,
    },
  });

  return labels;
}

// -----------------------------------------------------------------
// Stage 4 — Final Decode
// -----------------------------------------------------------------

function renderStage4(ctx: RenderCtx): LabelSpec[] {
  const { modules, categorized, viz, halfSize, cameraGoalRef, emit } = ctx;
  const p = ctx.eased;
  const text = viz.decodedText;
  const maxChars = Math.min(text.length, 48);

  const revealP = Math.min(1, p / 0.7);
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));
  const charsRevealed = Math.floor(revealP * (maxChars + 0.999));

  // Dim everything.
  for (const m of modules) {
    m._y = 0;
    m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
  }

  const currentCharIdx = Math.min(charsRevealed, maxChars) - 1;
  const decodeTable: Array<{ binary: string; hex: string; char: string }> = [];
  const labels: LabelSpec[] = [];

  for (let i = 0; i < Math.min(charsRevealed, maxChars); i++) {
    const char = text[i];
    const code = char.charCodeAt(0);
    decodeTable.push({
      binary: code.toString(2).padStart(8, '0'),
      hex: '0x' + code.toString(16).toUpperCase().padStart(2, '0'),
      char,
    });

    const isCurrent = i === currentCharIdx && revealP < 1;
    // current char glows in accent (pulses); already-decoded chars settle to cream.
    const cc = isCurrent ? QR_ACCENT : CREAM_RGB;
    const pulse = isCurrent ? 0.8 + 0.2 * Math.sin(performance.now() * 0.008) : 1.0;
    const startBit = i * 8;
    let cx = 0;
    let cz = 0;
    let count = 0;

    for (let b = 0; b < 8; b++) {
      const moduleIdx = startBit + b;
      if (moduleIdx < categorized.dataModuleIndices.length) {
        const idx = categorized.dataModuleIndices[moduleIdx];
        const m = modules[idx];
        m._r = cc.r * pulse;
        m._g = cc.g * pulse;
        m._b = cc.b * pulse;
        m._y = isCurrent ? 1.2 : 0.5;
        cx += m.col - halfSize + 0.5;
        cz += m.row - halfSize + 0.5;
        count++;

        if (isCurrent) {
          labels.push({
            id: `bit-${b}`,
            text: m.val ? '1' : '0',
            position: [m.col - halfSize + 0.5, 2.0, m.row - halfSize + 0.5],
            variant: 'bit',
          });
        }
      }
    }

    if (isCurrent && count > 0) {
      labels.push({
        id: 'current-char',
        text: `"${char}"`,
        position: [cx / count, 3.0, cz / count],
        variant: 'char',
      });
    }
  }

  if (charsRevealed > 0) {
    const decodedSoFar = text.substring(0, Math.min(charsRevealed, maxChars));
    labels.push({
      id: 'decoded-progress',
      text: decodedSoFar,
      position: [0, 4.5, 0],
      variant: 'decoded',
    });
  }

  // Keep finder patterns subtly visible.
  for (const m of modules) {
    if (m.cat === QrCat.Finder && m.val) {
      m._r = Math.max(m._r, 0.25);
      m._g = Math.max(m._g, 0.25);
      m._b = Math.max(m._b, 0.28);
    }
  }

  if (finalP > 0) {
    const dist = viz.gridSize * 1.1;
    cameraGoalRef.current.position = [dist * 0.5, dist * 0.9, dist * 0.5];
    cameraGoalRef.current.target = [0, 1, 0];
    // Replace running progress with full quoted text.
    const idx = labels.findIndex((l) => l.id === 'decoded-progress');
    const full: LabelSpec = {
      id: 'decoded-progress',
      text: `"${text}"`,
      position: [0, 5, 0],
      variant: 'decoded',
    };
    if (idx >= 0) labels[idx] = full;
    else labels.push(full);
    // Also drop current-char and per-bit labels in the final pose.
    for (let i = labels.length - 1; i >= 0; i--) {
      const id = labels[i].id;
      if (id === 'current-char' || id.startsWith('bit-')) labels.splice(i, 1);
    }
  }

  emit({
    type: 'decode',
    payload: {
      table: decodeTable,
      fullText: charsRevealed >= maxChars ? text : null,
    },
  });

  return labels;
}
