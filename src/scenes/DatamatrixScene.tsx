import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DmVizData } from '@/lib/codes/types';
import {
  categorizeDm,
  type DmCategorized,
  type DmModule,
} from '@/lib/codes/datamatrix/categorize';
import { DmCat } from '@/lib/codes/datamatrix/helpers';
import { DM_STAGES } from '@/lib/codes/datamatrix/config';
import { easeOutCubic, lerp } from '@/lib/codes/qr/helpers';
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

const DM_ACCENT = ACCENT_RGB.datamatrix;
const DM_ACCENT_STRONG = ACCENT_STRONG_RGB.datamatrix;
const DM_ACCENT_HEX = ACCENT_HEX.datamatrix;

interface Props {
  viz: DmVizData;
  stage: number;
  autoPlay: boolean;
  onAdvance: (newStage: number) => void;
}

export function DatamatrixScene({ viz, stage, autoPlay, onAdvance }: Props) {
  const categorized = useMemo(() => categorizeDm(viz), [viz]);
  const modulesRef = useRef<DmModule[]>(categorized.modules);

  useEffect(() => {
    modulesRef.current = categorized.modules;
  }, [categorized]);

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

  const cursorRef = useRef<THREE.Mesh>(null);
  const shieldRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    setLabels([]);
    labelsKeyRef.current = '';
    if (cursorRef.current) cursorRef.current.visible = false;
    if (shieldRef.current) {
      shieldRef.current.visible = false;
      (shieldRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
    }
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
  }, [stage, defaultGoal]);

  const progressRef = useStageAnimator({
    stage,
    stageCount: DM_STAGES.length,
    durations: DM_STAGES.map((s) => s.duration),
    autoPlay,
    onAdvance,
  });

  useFrame(() => {
    const p = progressRef.current;
    if (!p) return;
    const modules = modulesRef.current;
    setDefaultColors(modules);

    const ctx: Ctx = {
      modules,
      categorized,
      viz,
      eased: p.eased,
      raw: p.progress,
      halfSize: viz.gridSize / 2,
      cursor: cursorRef.current,
      shield: shieldRef.current,
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

      <group rotation={[Math.PI / 2, 0, 0]}>
        <InstancedGrid modulesRef={modulesRef} gridSize={viz.gridSize} />
        <StageLabels labels={labels} />

        <mesh ref={cursorRef} visible={false}>
          <sphereGeometry args={[0.45, 16, 16]} />
          <meshBasicMaterial color={DM_ACCENT_HEX} transparent opacity={0.9} />
        </mesh>

        <mesh ref={shieldRef} position={[0, 2, 0]} visible={false}>
          <icosahedronGeometry args={[viz.gridSize * 0.4, 2]} />
          <meshBasicMaterial
            color={DM_ACCENT_HEX}
            transparent
            opacity={0}
            wireframe
          />
        </mesh>
      </group>
    </>
  );
}

interface Ctx {
  modules: DmModule[];
  categorized: DmCategorized;
  viz: DmVizData;
  eased: number;
  raw: number;
  halfSize: number;
  cursor: THREE.Mesh | null;
  shield: THREE.Mesh | null;
}

function setDefaultColors(modules: DmModule[]): void {
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

// Stage 0: L-shaped finder rises and glows.
function renderStage0(ctx: Ctx): LabelSpec[] {
  const { modules, halfSize, viz } = ctx;
  const p = ctx.eased;
  const sc = DM_ACCENT;
  const riseP = Math.min(1, p / 0.6);
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
  const labelP = Math.max(0, Math.min(1, (p - 0.7) / 0.3));

  for (const m of modules) {
    if (m.cat === DmCat.LFinder && riseP > 0) {
      // Bottom row first, then left column.
      let delay = 0;
      if (m.col === 0 && m.row < viz.gridSize - 1) delay = 0.4;
      const localP = Math.max(0, Math.min(1, (riseP - delay) / (1 - delay)));
      const ep = easeOutCubic(localP);
      m._y = ep * 2;
      if (m.val) {
        const glow = ep * (0.8 + 0.2 * glowPulse);
        m._r = lerp(m._r, sc.r * glow, ep);
        m._g = lerp(m._g, sc.g * glow, ep);
        m._b = lerp(m._b, sc.b * glow, ep);
      }
    }
  }

  const labels: LabelSpec[] = [];
  if (labelP > 0) {
    labels.push(
      { id: 'l-bottom', text: 'L-Finder (bottom)', position: [0, -halfSize + 1, 3] },
      { id: 'l-left', text: 'L-Finder (left)', position: [-halfSize + 1, 0, 3] },
    );
  }
  return labels;
}

// Stage 1: Clock track — top row + right column light up sequentially.
function renderStage1(ctx: Ctx): LabelSpec[] {
  const { modules, halfSize, viz } = ctx;
  const p = ctx.eased;
  const sc = CREAM_RGB; // clock = cream/warm for contrast vs accent finder

  const topP = Math.min(1, p / 0.5);
  const rightP = Math.max(0, Math.min(1, (p - 0.3) / 0.5));
  const labelP = Math.max(0, Math.min(1, (p - 0.7) / 0.3));

  for (const m of modules) {
    if (m.cat !== DmCat.Clock) continue;
    let localP = 0;
    if (m.row === 0) {
      const delay = m.col / viz.gridSize;
      localP = Math.max(0, Math.min(1, (topP - delay) / (1 - delay)));
    } else if (m.col === viz.gridSize - 1) {
      const delay = m.row / viz.gridSize;
      localP = Math.max(0, Math.min(1, (rightP - delay) / (1 - delay)));
    }
    if (localP > 0) {
      const ep = easeOutCubic(localP);
      m._y = ep * 1.5;
      if (m.val) {
        m._r = lerp(m._r, sc.r, ep);
        m._g = lerp(m._g, sc.g, ep);
        m._b = lerp(m._b, sc.b, ep);
      }
    }
  }

  const labels: LabelSpec[] = [];
  if (labelP > 0) {
    labels.push(
      { id: 'clock-top', text: 'Clock track (top)', position: [0, halfSize - 1, 3] },
      { id: 'clock-right', text: 'Clock track (right)', position: [halfSize - 1, 0, 3] },
    );
  }
  return labels;
}

// Stage 2: Diagonal data read.
function renderStage2(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, halfSize, cursor } = ctx;
  const p = ctx.eased;
  const sc = DM_ACCENT;

  const readP = Math.max(0, Math.min(1, p / 0.9));
  const total = categorized.dataModuleIndices.length;
  let revealed: number;
  if (readP <= 0.2) {
    revealed = Math.floor((readP / 0.2) * total * 0.2);
  } else {
    const remaining = total - Math.floor(total * 0.2);
    revealed = Math.floor(total * 0.2 + ((readP - 0.2) / 0.8) * remaining);
  }
  revealed = Math.min(revealed, total);

  // Dim all data first.
  for (const m of modules) {
    if (m.cat === DmCat.Data) {
      m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
    }
  }

  // Light up read modules.
  for (let i = 0; i < revealed; i++) {
    const idx = categorized.dataModuleIndices[i];
    const m = modules[idx];
    const age = revealed - i;
    const brightness = Math.max(0.3, 1 - age / 50);
    m._r = sc.r * brightness;
    m._g = sc.g * brightness;
    m._b = sc.b * brightness;
    m._y = brightness * 0.3;
  }

  // Cursor.
  if (cursor) {
    if (revealed > 0 && revealed < total) {
      const curIdx = categorized.dataModuleIndices[Math.min(revealed, total - 1)];
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

  return [];
}

// Stage 3: Error correction — data vs EC separation + shield.
function renderStage3(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, halfSize, shield } = ctx;
  const p = ctx.eased;

  const separateP = Math.min(1, p / 0.3);
  const shieldP = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
  const returnP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  const dataColor = DM_ACCENT;
  const ecColor = WARN_RGB;

  for (let i = 0; i < categorized.dataModuleIndices.length; i++) {
    const idx = categorized.dataModuleIndices[i];
    const m = modules[idx];
    const isData = i < categorized.dataCodewordCount;
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

  if (shield) {
    if (shieldP > 0 && returnP < 1) {
      shield.visible = true;
      const sm = shield.material as THREE.MeshBasicMaterial;
      const se = easeOutCubic(shieldP);
      sm.opacity = se * 0.4 * (1 - returnP);
      shield.scale.setScalar(0.5 + se * 0.5);
      shield.rotation.y += 0.005;
    } else {
      shield.visible = false;
    }
  }

  const labels: LabelSpec[] = [];
  if (separateP > 0.5) {
    labels.push(
      { id: 'dm-data-label', text: 'Data codewords', position: [0, 3.5, 0], variant: 'data' },
      { id: 'dm-ec-label', text: 'Error correction', position: [0, -0.5, 0], variant: 'ec' },
    );
  }
  // Use halfSize/DM_ACCENT_STRONG so they're referenced (prevents unused warnings)
  void halfSize;
  void DM_ACCENT_STRONG;
  return labels;
}

// Stage 4: Reveal characters using the accent for the current letter.
function renderStage4(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, viz, halfSize } = ctx;
  const p = ctx.eased;
  const text = viz.decodedText;
  const maxChars = Math.min(text.length, 32);

  const revealP = Math.min(1, p / 0.7);
  const charsRevealed = Math.floor(revealP * (maxChars + 0.999));
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  for (const m of modules) {
    m._y = 0;
    m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
  }

  const currentCharIdx = Math.min(charsRevealed, maxChars) - 1;
  const labels: LabelSpec[] = [];

  for (let i = 0; i < Math.min(charsRevealed, maxChars); i++) {
    const char = text[i];
    const isCurrent = i === currentCharIdx && revealP < 1;
    const cc = isCurrent ? DM_ACCENT : CREAM_RGB;
    const pulse = isCurrent ? 0.8 + 0.2 * Math.sin(performance.now() * 0.008) : 1.0;

    const startBit = i * 8;
    let cx = 0, cz = 0, count = 0;
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
    labels.push({
      id: 'decoded-progress',
      text:
        finalP > 0
          ? `"${text}"`
          : text.substring(0, Math.min(charsRevealed, maxChars)),
      position: finalP > 0 ? [0, 5, 0] : [0, 4.5, 0],
      variant: 'decoded',
    });
  }

  // Keep L-finder subtly visible.
  for (const m of modules) {
    if (m.cat === DmCat.LFinder && m.val) {
      m._r = Math.max(m._r, 0.25);
      m._g = Math.max(m._g, 0.25);
      m._b = Math.max(m._b, 0.28);
    }
  }

  if (finalP > 0) {
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].id === 'current-char') labels.splice(i, 1);
    }
  }

  return labels;
}
