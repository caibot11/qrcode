import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AztecVizData } from '@/lib/codes/types';
import {
  categorizeAztec,
  type AztecCategorized,
  type AztecModule,
} from '@/lib/codes/aztec/categorize';
import { AztecCat } from '@/lib/codes/aztec/helpers';
import { AZTEC_STAGES } from '@/lib/codes/aztec/config';
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

const AZ_ACCENT = ACCENT_RGB.aztec;
const AZ_ACCENT_STRONG = ACCENT_STRONG_RGB.aztec;
const AZ_ACCENT_HEX = ACCENT_HEX.aztec;

interface Props {
  viz: AztecVizData;
  stage: number;
  autoPlay: boolean;
  onAdvance: (newStage: number) => void;
}

export function AztecScene({ viz, stage, autoPlay, onAdvance }: Props) {
  const categorized = useMemo(() => categorizeAztec(viz), [viz]);
  const modulesRef = useRef<AztecModule[]>(categorized.modules);

  useEffect(() => {
    modulesRef.current = categorized.modules;
  }, [categorized]);

  const defaultGoal = useMemo<CameraGoal>(() => {
    const dist = viz.gridSize * 2.4;
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
    stageCount: AZTEC_STAGES.length,
    durations: AZTEC_STAGES.map((s) => s.duration),
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
          <meshBasicMaterial color={AZ_ACCENT_HEX} transparent opacity={0.9} />
        </mesh>

        <mesh ref={shieldRef} position={[0, 2, 0]} visible={false}>
          <icosahedronGeometry args={[viz.gridSize * 0.4, 2]} />
          <meshBasicMaterial
            color={AZ_ACCENT_HEX}
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
  modules: AztecModule[];
  categorized: AztecCategorized;
  viz: AztecVizData;
  eased: number;
  raw: number;
  halfSize: number;
  cursor: THREE.Mesh | null;
  shield: THREE.Mesh | null;
}

function setDefaultColors(modules: AztecModule[]): void {
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

// Stage 0: Bullseye — rings rise innermost to outermost in pink glow.
function renderStage0(ctx: Ctx): LabelSpec[] {
  const { modules } = ctx;
  const p = ctx.eased;
  const sc = AZ_ACCENT;
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  for (const m of modules) {
    if (m.cat === AztecCat.Bullseye) {
      const ringDelay = m.ring * 0.25;
      const localP = Math.max(0, Math.min(1, (p - ringDelay) / 0.4));
      const ep = easeOutCubic(localP);
      m._y = ep * (3 - m.ring * 0.5);
      if (m.val) {
        const glow = ep * (0.8 + 0.2 * glowPulse);
        m._r = lerp(m._r, sc.r * glow, ep);
        m._g = lerp(m._g, sc.g * glow, ep);
        m._b = lerp(m._b, sc.b * glow, ep);
      }
    }
  }

  const labels: LabelSpec[] = [];
  if (p > 0.7) {
    labels.push({ id: 'bullseye-label', text: 'Bullseye finder', position: [0, 0, 5] });
  }
  return labels;
}

// Stage 1: Mode message ring lights up.
function renderStage1(ctx: Ctx): LabelSpec[] {
  const { modules, halfSize } = ctx;
  const p = ctx.eased;
  const sc = AZ_ACCENT_STRONG;
  const riseP = Math.min(1, p / 0.5);
  const infoP = Math.max(0, Math.min(1, (p - 0.5) / 0.5));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);

  for (const m of modules) {
    if (m.cat === AztecCat.Mode) {
      const ep = easeOutCubic(riseP);
      m._y = ep * 1.5;
      if (m.val) {
        m._r = lerp(m._r, sc.r * (0.8 + 0.2 * glowPulse), ep);
        m._g = lerp(m._g, sc.g * 0.85, ep);
        m._b = lerp(m._b, sc.b * 0.85, ep);
      }
    }
  }

  const labels: LabelSpec[] = [];
  if (riseP > 0.5) {
    labels.push({ id: 'mode-label', text: 'Mode message', position: [0, -halfSize + 2, 3] });
  }
  if (infoP > 0.3) {
    labels.push({ id: 'mode-info', text: 'Layers 2 · Words 5', position: [0, halfSize - 2, 3] });
  }
  return labels;
}

// Stage 2: Spiral read through data layers.
function renderStage2(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, halfSize, cursor } = ctx;
  const p = ctx.eased;
  const sc = AZ_ACCENT;

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

  for (const m of modules) {
    if (m.cat === AztecCat.Data) {
      m._r *= 0.3; m._g *= 0.3; m._b *= 0.3;
    }
  }

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

// Stage 3: Error correction — same data/EC split as QR/DM.
function renderStage3(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, shield } = ctx;
  const p = ctx.eased;

  const separateP = Math.min(1, p / 0.3);
  const shieldP = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
  const returnP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  const dataColor = AZ_ACCENT;
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
      { id: 'az-data-label', text: 'Data codewords', position: [0, 3.5, 0], variant: 'data' },
      { id: 'az-ec-label', text: 'Error correction', position: [0, -0.5, 0], variant: 'ec' },
    );
  }
  return labels;
}

// Stage 4: Reveal characters letter by letter.
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
    const cc = isCurrent ? AZ_ACCENT : CREAM_RGB;
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

  // Keep bullseye subtly visible.
  for (const m of modules) {
    if (m.cat === AztecCat.Bullseye && m.val) {
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
