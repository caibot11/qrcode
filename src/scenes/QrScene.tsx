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
  CREAM_RGB,
  EC_RGB,
} from '@/lib/codes/accents';
import { InstancedGrid } from '@/lib/three/InstancedGrid';
import { CameraRig, type CameraGoal } from '@/lib/three/CameraRig';
import { SceneEnvironment } from '@/lib/three/SceneEnvironment';
import { StageLabels, type LabelSpec } from '@/lib/three/StageLabels';
import { useStageAnimator } from '@/lib/three/useStageAnimator';

// Single accent per code type. Stages are distinguished by motion, glow
// intensity, and the auxiliary colors (cream for "decoded", warn for error-
// correction), not by 5 unrelated hues.
const QR_ACCENT_HEX = ACCENT_HEX.qr;
// Deeper blue for the raised structural tiles (finders / timing / alignment) in
// the Structure stage, so they read darker than the bright theme accent.
const QR_STRUCT_BLUE = { r: 0.16, g: 0.38, b: 0.74 };

const TRAIL_CAPACITY = 600;

// Stage 3 repair beams. Vertex-color trick: material is white with
// vertexColors:true, so per-vertex color doubles as a brightness/opacity knob
// on a dark background. Inactive segments collapse to a single point so they
// don't draw a visible line.
const MAX_BEAMS = 8;
const BEAM_SPAWN_INTERVAL = 200; // ms between new beams during repair
const BEAM_FADE_IN = 120;
const BEAM_HOLD = 800;
const BEAM_FADE_OUT = 400;
const BEAM_LIFETIME = BEAM_FADE_IN + BEAM_HOLD + BEAM_FADE_OUT;

interface BeamSlot {
  active: boolean;
  ecIdx: number;
  dataIdx: number;
  t0: number;
}

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
  loop?: boolean;
  onFinished?: () => void;
}

export function QrScene({
  viz,
  stage,
  autoPlay,
  onAdvance,
  onStageData,
  loop,
  onFinished,
}: Props) {
  const categorized = useMemo(() => categorizeQr(viz), [viz]);
  const modulesRef = useRef<QrModule[]>(categorized.modules);

  useEffect(() => {
    modulesRef.current = categorized.modules;
  }, [categorized]);

  const defaultGoal = useMemo<CameraGoal>(() => {
    const dist = viz.gridSize * 1.85;
    return {
      position: [dist * 0.09, dist * 0.05, dist * 0.99],
      target: [0, 0, 0],
    };
  }, [viz.gridSize]);

  const cameraGoalRef = useRef<CameraGoal>({
    position: [...defaultGoal.position] as [number, number, number],
    target: [...defaultGoal.target] as [number, number, number],
  });

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

  const [labels, setLabels] = useState<LabelSpec[]>([]);
  const labelsKeyRef = useRef('');

  // Stage-3 / stage-2 extras.
  const maskPlaneRef = useRef<THREE.Mesh>(null);
  const cursorRef = useRef<THREE.Mesh>(null);


  // Trail line (stage 2).
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

  useEffect(() => {
    const captured = trail;
    return () => {
      captured.geometry.dispose();
      captured.material.dispose();
    };
  }, [trail]);

  // Stage 3 repair beams (EC plane → damaged data bit).
  // One Line + Material per beam so each can fade independently via
  // material.opacity. Cheaper than vertex-color tricks and works reliably
  // with three.js LineBasicMaterial alpha.
  const beams = useMemo(() => {
    const group = new THREE.Group();
    group.visible = false;
    const items = [] as Array<{
      line: THREE.Line;
      geometry: THREE.BufferGeometry;
      material: THREE.LineBasicMaterial;
      positions: Float32Array;
    }>;
    for (let i = 0; i < MAX_BEAMS; i++) {
      const positions = new Float32Array(6); // 2 verts × 3 floats
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: QR_ACCENT_HEX,
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.renderOrder = 999;
      group.add(line);
      items.push({ line, geometry: geo, material: mat, positions });
    }
    return { group, items };
  }, []);

  useEffect(() => {
    const captured = beams;
    return () => {
      for (const it of captured.items) {
        it.geometry.dispose();
        it.material.dispose();
      }
    };
  }, [beams]);

  const beamPoolRef = useRef<BeamSlot[]>(
    Array.from({ length: MAX_BEAMS }, () => ({
      active: false,
      ecIdx: 0,
      dataIdx: 0,
      t0: 0,
    })),
  );
  const lastBeamSpawnRef = useRef(0);
  const beamRoundRobinRef = useRef(0);

  // Reset visuals + camera when the stage changes.
  useEffect(() => {
    setLabels([]);
    labelsKeyRef.current = '';
    stageDataKeyRef.current = '';
    if (maskPlaneRef.current) maskPlaneRef.current.visible = false;
    if (cursorRef.current) cursorRef.current.visible = false;
    trail.line.visible = false;
    trail.geometry.setDrawRange(0, 0);
    beams.group.visible = false;
    for (const it of beams.items) it.line.visible = false;
    for (const slot of beamPoolRef.current) slot.active = false;
    lastBeamSpawnRef.current = 0;
    beamRoundRobinRef.current = 0;
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
  }, [stage, defaultGoal, trail, beams]);

  const stageDataKeyRef = useRef('');
  const emitStageData = (data: QrStageData) => {
    if (!onStageData) return;
    const key = data.type + JSON.stringify(data.payload);
    if (key === stageDataKeyRef.current) return;
    stageDataKeyRef.current = key;
    onStageData(data);
  };

  const progressRef = useStageAnimator({
    stage,
    stageCount: QR_STAGES.length,
    durations: QR_STAGES.map((s) => s.duration),
    autoPlay,
    onAdvance,
    loop,
    onFinished,
  });

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
        trailLine: trail.line,
        trailPositions: trail.positions,
        trailGeometry: trail.geometry,
        beams,
        beamPool: beamPoolRef.current,
        beamSpawnRef: lastBeamSpawnRef,
        beamRoundRobinRef,
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
          camera. All children share this transform so legacy XZ-plane
          coordinates "just work" as a face-on wall. */}
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

        {/* Stage-3 repair beams (EC → damaged data) */}
        <primitive object={beams.group} />
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
    trailLine: THREE.Line;
    trailPositions: Float32Array;
    trailGeometry: THREE.BufferGeometry;
    beams: {
      group: THREE.Group;
      items: Array<{
        line: THREE.Line;
        geometry: THREE.BufferGeometry;
        material: THREE.LineBasicMaterial;
        positions: Float32Array;
      }>;
    };
    beamPool: BeamSlot[];
    beamSpawnRef: React.MutableRefObject<number>;
    beamRoundRobinRef: React.MutableRefObject<number>;
  };
  cameraGoalRef: React.RefObject<CameraGoal>;
  defaultGoal: CameraGoal;
  emit: (data: QrStageData) => void;
}

function setDefaultColors(modules: QrModule[]): void {
  for (const m of modules) {
    if (m.val) {
      // Dark (black) module — actually black (unlit; the gaps + white tiles
      // give it definition against the brownish background).
      m._r = 0.02; m._g = 0.02; m._b = 0.03;
    } else {
      // Light (white) module.
      m._r = 0.93; m._g = 0.94; m._b = 0.97;
    }
    m._y = 0;
    m._scaleY = 1;
  }
}

function labelsKey(labels: LabelSpec[]): string {
  let out = '';
  for (const l of labels) {
    out += `${l.id}|${l.text}|${l.position[0].toFixed(2)},${l.position[1].toFixed(2)},${l.position[2].toFixed(2)}|${l.variant ?? 'd'}|${l.opacity?.toFixed(2) ?? '1'}||`;
  }
  return out;
}

// -----------------------------------------------------------------
// Stage 0 — Structure
// -----------------------------------------------------------------

function renderStage0(ctx: RenderCtx): LabelSpec[] {
  const { modules, viz, halfSize, categorized, emit } = ctx;
  const p = ctx.eased;
  const sc = QR_STRUCT_BLUE;

  const fadeIn = Math.min(1, p / 0.15);
  const finderP = Math.max(0, Math.min(1, (p - 0.15) / 0.35));
  const timingP = Math.max(0, Math.min(1, (p - 0.5) / 0.2));
  const alignP = Math.max(0, Math.min(1, (p - 0.7) / 0.15));
  const labelP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  for (const m of modules) {
    if (m.val) {
      m._r = 0.02 * fadeIn; m._g = 0.02 * fadeIn; m._b = 0.03 * fadeIn;
    } else {
      m._r = 0.93 * fadeIn; m._g = 0.94 * fadeIn; m._b = 0.97 * fadeIn;
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
        m._r = lerp(m._r, sc.r, ep);
        m._g = lerp(m._g, sc.g, ep);
        m._b = lerp(m._b, sc.b, ep);
      }
    }

    if (m.cat === QrCat.Alignment && alignP > 0) {
      const ep = easeOutCubic(alignP);
      m._y = ep * 1.5;
      if (m.val) {
        m._r = lerp(m._r, QR_STRUCT_BLUE.r, ep);
        m._g = lerp(m._g, QR_STRUCT_BLUE.g, ep);
        m._b = lerp(m._b, QR_STRUCT_BLUE.b, ep);
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
  const sc = QR_STRUCT_BLUE;

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
  const sc = QR_STRUCT_BLUE;

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
// Stage 3 — Error Correction (no sphere; EC→data repair beams instead)
// -----------------------------------------------------------------

function renderStage3(ctx: RenderCtx): LabelSpec[] {
  const { modules, categorized, halfSize, extras, emit } = ctx;
  const p = ctx.eased;
  const model = categorized.model;

  const separateP = Math.min(1, p / 0.25);
  const damageP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const returnP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  const dataColor = QR_STRUCT_BLUE;
  const ecColor = EC_RGB;

  const readOrder = categorized.dataModuleIndices;
  const totalLen = readOrder.length;
  // Real codeword counts (spec) + per-codeword data/EC classification, else the
  // old first-60% fallback.
  const dataBytes = model ? model.dataCodewords : Math.floor((totalLen / 8) * 0.6);
  const ecBytes = model ? model.ecCodewords : Math.floor(totalLen / 8) - dataBytes;
  const correctable = model ? model.correctable : 2;
  const isDataModule = (i: number): boolean =>
    model ? (model.codewordIsData[Math.floor(i / 8)] ?? true) : i < dataBytes * 8;

  // Kept only so the (disabled) legacy beam block below still type-checks.
  const dataLen = dataBytes * 8;
  const ecLen = totalLen - dataLen;

  // Separate codewords into a data plane (lifted, blue) and an EC plane
  // (lowered, red), coloured per REAL codeword (de-interleaved).
  const sepEased = easeOutCubic(separateP);
  const retEased = returnP > 0 ? easeOutCubic(returnP) : 0;
  for (let i = 0; i < totalLen; i++) {
    if (separateP <= 0) break;
    const m = modules[readOrder[i]];
    const isData = isDataModule(i);
    const col = isData ? dataColor : ecColor;
    m._y = sepEased * (isData ? 2.0 : -1.0) * (1 - retEased);
    m._r = lerp(m._r, col.r, sepEased);
    m._g = lerp(m._g, col.g, sepEased);
    m._b = lerp(m._b, col.b, sepEased);
  }

  // Damage → recover: corrupt the modules of a few codewords, then flash them
  // back. Reed–Solomon genuinely fixes up to `correctable` codeword errors.
  let damagedCount = 0;
  if (damageP > 0) {
    const cwCount = Math.floor(totalLen / 8);
    const show = Math.min(correctable, 6);
    const stepCw = Math.max(1, Math.floor(cwCount / Math.max(1, show)));
    for (let cw = 0; cw < cwCount && damagedCount < show; cw += stepCw) {
      damagedCount++;
      for (let b = 0; b < 8; b++) {
        const i = cw * 8 + b;
        if (i >= totalLen) break;
        const m = modules[readOrder[i]];
        if (damageP < 0.5) {
          const dP = damageP * 2;
          m._r = lerp(m._r, 1.0, dP);
          m._g = lerp(m._g, 0.2, dP);
          m._b = lerp(m._b, 0.2, dP);
        } else if (Math.sin((damageP - 0.5) * 2 * Math.PI * 3) > 0) {
          m._r = 1.0; m._g = 1.0; m._b = 1.0;
        }
      }
    }
  }

  // ---------------- repair beams ----------------
  // Disabled: the EC→data beams rendered as a tangled web. The data/EC split +
  // damage/repair flashes carry the concept on their own.
  const beamsOn = false;
  const now = performance.now();

  if (beamsOn) {
    extras.beams.group.visible = true;

    // Spawn a new beam every BEAM_SPAWN_INTERVAL ms.
    if (now - extras.beamSpawnRef.current > BEAM_SPAWN_INTERVAL) {
      const freeIdx = extras.beamPool.findIndex((s) => !s.active);
      if (freeIdx >= 0) {
        const damagedSeq = beamRoundRobinPickDamaged(
          extras.beamRoundRobinRef,
          dataLen,
        );
        if (damagedSeq >= 0) {
          const slot = extras.beamPool[freeIdx];
          slot.active = true;
          slot.dataIdx = damagedSeq;
          slot.ecIdx = dataLen + (Math.floor(damagedSeq / 7) % ecLen);
          slot.t0 = now;
          extras.beamSpawnRef.current = now;
        }
      }
    }

    // Walk pool — one Line+Material per slot, opacity per beam.
    for (let i = 0; i < extras.beamPool.length; i++) {
      const slot = extras.beamPool[i];
      const item = extras.beams.items[i];

      if (!slot.active) {
        item.line.visible = false;
        continue;
      }

      const age = now - slot.t0;
      if (age > BEAM_LIFETIME) {
        slot.active = false;
        item.line.visible = false;
        continue;
      }

      // Opacity envelope (trapezoid: fade-in / hold / fade-out).
      let opacity: number;
      if (age < BEAM_FADE_IN) {
        opacity = age / BEAM_FADE_IN;
      } else if (age < BEAM_FADE_IN + BEAM_HOLD) {
        opacity = 1;
      } else {
        opacity = 1 - (age - BEAM_FADE_IN - BEAM_HOLD) / BEAM_FADE_OUT;
      }

      const ecModule = modules[categorized.dataModuleIndices[slot.ecIdx]];
      const dataModule = modules[categorized.dataModuleIndices[slot.dataIdx]];

      const pos = item.positions;
      pos[0] = ecModule.col - halfSize + 0.5;
      pos[1] = ecModule._y;
      pos[2] = ecModule.row - halfSize + 0.5;
      pos[3] = dataModule.col - halfSize + 0.5;
      pos[4] = dataModule._y;
      pos[5] = dataModule.row - halfSize + 0.5;
      item.geometry.attributes.position.needsUpdate = true;
      item.material.opacity = opacity;
      item.line.visible = true;
    }
  } else {
    extras.beams.group.visible = false;
    for (const it of extras.beams.items) it.line.visible = false;
    for (const slot of extras.beamPool) slot.active = false;
  }

  // Labels separated on screen: data above (local -z → screen top), EC below
  // (local +z → screen bottom). They previously differed only in depth (local
  // y) so both projected to screen-centre and overlapped.
  const labels: LabelSpec[] = [];
  if (separateP > 0.5) {
    labels.push(
      {
        id: 'data-label',
        text: `Data · ${dataBytes} bytes`,
        position: [-halfSize - 3, 1, -halfSize * 0.45],
        variant: 'data',
      },
      {
        id: 'ec-label',
        text: `Error correction · ${ecBytes} bytes`,
        position: [-halfSize - 3, 1, halfSize * 0.45],
        variant: 'ec',
      },
    );
  }
  if (damageP > 0.3 && damageP < 0.7) {
    labels.push({
      id: 'damage-label',
      text: 'Damage detected',
      position: [-halfSize - 3, 1, 0],
      variant: 'warn',
    });
  }
  if (damageP > 0.7) {
    labels.push({
      id: 'repair-label',
      text: `Repaired — RS fixes up to ${correctable}`,
      position: [-halfSize - 3, 1, 0],
      variant: 'success',
    });
  }

  emit({
    type: 'errorCorrection',
    payload: {
      dataBytes,
      ecBytes,
      damaged: damageP > 0.1 ? damagedCount : 0,
      repaired: damageP > 0.5 ? damagedCount : 0,
    },
  });

  return labels;
}

// Round-robin through the set of damaged data indices ({0, 7, 14, …} ∩ [0, dataLen)).
function beamRoundRobinPickDamaged(
  rrRef: React.MutableRefObject<number>,
  dataLen: number,
): number {
  if (dataLen <= 0) return -1;
  const count = Math.ceil(dataLen / 7);
  if (count <= 0) return -1;
  const seq = rrRef.current % count;
  rrRef.current = (rrRef.current + 1) % count;
  return seq * 7;
}

// -----------------------------------------------------------------
// Stage 4 — Final Decode (pill + face-on, no top-down fly-around)
// -----------------------------------------------------------------

function renderStage4(ctx: RenderCtx): LabelSpec[] {
  const { modules, categorized, viz, halfSize, cameraGoalRef, defaultGoal, emit } = ctx;
  const p = ctx.eased;
  const model = categorized.model;
  const readOrder = categorized.dataModuleIndices;

  // Reveal real decode "symbols": byte = 1 char/8 bits, alphanumeric = 2
  // chars/11 bits, numeric = 3 digits/10 bits. Each carries its REAL bits and
  // the modules of the codewords those bits live in.
  const text = model ? model.decodedText : viz.decodedText;
  const units: { chars: string; bits: string; mods: number[] }[] = model
    ? model.symbols.map((s) => ({
        chars: s.chars,
        bits: s.bits,
        mods: s.codewords.flatMap((cw) => readOrder.slice(cw * 8, cw * 8 + 8)),
      }))
    : Array.from({ length: Math.min(viz.decodedText.length, 48) }, (_, i) => {
        const mods = readOrder.slice(i * 8, i * 8 + 8);
        const bits = mods
          .map((idx) =>
            categorized.unmaskedGrid[modules[idx].row][modules[idx].col],
          )
          .join('');
        return { chars: viz.decodedText[i], bits, mods };
      });
  const maxUnits = Math.min(units.length, 48);

  const revealP = Math.min(1, p / 0.85);
  const unitProgress = revealP * maxUnits;
  const currentIdx = Math.min(Math.floor(unitProgress), maxUnits - 1);
  const cp = Math.max(0, Math.min(1, unitProgress - currentIdx));

  // Dim everything; the per-unit loop re-lights the relevant modules.
  for (const m of modules) {
    m._y = 0;
    m._r *= 0.22; m._g *= 0.22; m._b *= 0.22;
  }

  const decodeTable: Array<{ binary: string; hex: string; char: string }> = [];
  const labels: LabelSpec[] = [];
  let centroidX = 0;
  let centroidZ = 0;

  for (let i = 0; i <= Math.min(currentIdx, maxUnits - 1); i++) {
    const u = units[i];
    if (!u) break;
    for (const ch of u.chars) {
      const code = ch.charCodeAt(0);
      decodeTable.push({
        binary: code.toString(2).padStart(8, '0'),
        hex: '0x' + code.toString(16).toUpperCase().padStart(2, '0'),
        char: ch,
      });
    }

    const isCurrent = i === currentIdx && revealP < 1;
    const cc = isCurrent ? QR_STRUCT_BLUE : CREAM_RGB;
    const pulse = isCurrent ? 0.8 + 0.2 * Math.sin(performance.now() * 0.008) : 1.0;
    let cx = 0; let cz = 0; let count = 0;

    for (let b = 0; b < u.mods.length; b++) {
      const m = modules[u.mods[b]];
      m._r = cc.r * pulse;
      m._g = cc.g * pulse;
      m._b = cc.b * pulse;
      m._y = isCurrent ? 1.2 : 0.5;
      cx += m.col - halfSize + 0.5;
      cz += m.row - halfSize + 0.5;
      count++;
      // During the read sub-phase, show this unit's REAL bits over its modules.
      if (isCurrent && cp < 0.25 && b < u.bits.length) {
        labels.push({
          id: `bit-${b}`,
          text: u.bits[b],
          position: [m.col - halfSize + 0.5, 2.0, m.row - halfSize + 0.5],
          variant: 'bit',
        });
      }
    }

    if (isCurrent && count > 0) {
      centroidX = cx / count;
      centroidZ = cz / count;
    }
  }

  // Pill is always present during stage 4. It updates the moment the current
  // unit's char(s) "arrive" (cp > 0.95), or once everything is revealed.
  const pillPosition: [number, number, number] = [-halfSize - 3, 2, 0];
  const pillMax = Math.min(text.length, 48);
  const revealedUnits =
    revealP >= 1 ? maxUnits : currentIdx + (cp > 0.95 ? 1 : 0);
  let revealedChars = 0;
  for (let i = 0; i < revealedUnits && i < units.length; i++) {
    revealedChars += units[i].chars.length;
  }
  labels.push({
    id: 'pill',
    text: buildPillText(text, revealedChars, pillMax),
    position: pillPosition,
    variant: 'pill',
  });

  // Flying char(s) during Resolve+Travel of the current unit.
  if (currentIdx < maxUnits && revealP < 1 && cp >= 0.25) {
    const chars = units[currentIdx]?.chars ?? '';
    if (chars) {
      // Resolve: 0.25 → 0.5 (char appears in front of modules).
      // Travel : 0.5 → 1.0 (char lerps toward the pill).
      const travel = Math.max(0, (cp - 0.25) / 0.7);
      const t = easeOutCubic(Math.min(1, travel));
      const startPos: [number, number, number] = [centroidX, 2.5, centroidZ];
      const pos: [number, number, number] = [
        lerp(startPos[0], pillPosition[0], t),
        lerp(startPos[1], pillPosition[1], t),
        lerp(startPos[2], pillPosition[2], t),
      ];
      // Fade out as it nears the pill.
      const opacity = cp > 0.7 ? Math.max(0, 1 - (cp - 0.7) / 0.25) : 1;
      labels.push({
        id: 'decoding-char',
        text: chars,
        position: pos,
        variant: 'decoding',
        opacity,
      });
    }
  }

  // Keep the corner finder patterns at full black/white contrast so the
  // corners stay recognizable (not flattened to grey blobs) during decode.
  for (const m of modules) {
    if (m.cat === QrCat.Finder) {
      if (m.val) {
        m._r = 0.04; m._g = 0.04; m._b = 0.05;
      } else {
        m._r = 0.85; m._g = 0.86; m._b = 0.9;
      }
    }
  }

  // Gentle pullback at the end — no fly-around. Camera target unchanged.
  if (p > 0.85) {
    const t = Math.min(1, (p - 0.85) / 0.15);
    const scale = 1 + t * 0.1;
    cameraGoalRef.current.position = [
      defaultGoal.position[0] * scale,
      defaultGoal.position[1] * scale,
      defaultGoal.position[2] * scale,
    ];
  } else {
    cameraGoalRef.current.position = [...defaultGoal.position];
  }

  emit({
    type: 'decode',
    payload: {
      table: decodeTable,
      fullText: revealedUnits >= maxUnits ? text : null,
    },
  });

  return labels;
}

function buildPillText(
  text: string,
  decodedCount: number,
  maxChars: number,
): string {
  let out = '';
  for (let i = 0; i < maxChars; i++) {
    out += i < decodedCount ? text[i] : '·';
  }
  return out;
}
