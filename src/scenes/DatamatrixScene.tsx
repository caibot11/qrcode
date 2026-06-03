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
  EC_RGB,
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
  loop?: boolean;
  onFinished?: () => void;
}

export function DatamatrixScene({ viz, stage, autoPlay, onAdvance, loop, onFinished }: Props) {
  const categorized = useMemo(() => categorizeDm(viz), [viz]);
  const modulesRef = useRef<DmModule[]>(categorized.modules);

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
    loop,
    onFinished,
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
      m._r = 0.02; m._g = 0.02; m._b = 0.03;
    } else {
      m._r = 0.93; m._g = 0.94; m._b = 0.97;
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

// Stage 3: Error correction — real de-interleave (data vs EC, per real
// codeword) + genuine Reed–Solomon damage→recover.
function renderStage3(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, halfSize, shield } = ctx;
  const p = ctx.eased;
  const model = categorized.model;

  const separateP = Math.min(1, p / 0.3);
  const damageP = Math.max(0, Math.min(1, (p - 0.5) / 0.35));
  const returnP = Math.max(0, Math.min(1, (p - 0.85) / 0.15));

  const dataColor = DM_ACCENT;
  const ecColor = EC_RGB;

  const readOrder = categorized.dataModuleIndices;
  const totalLen = readOrder.length;
  // Real codeword counts (ISO 16022 Table 7) + per-codeword data/EC class.
  const dataBytes = model
    ? model.dataCodewords
    : Math.floor((totalLen / 8) * 0.6);
  const ecBytes = model
    ? model.ecCodewords
    : Math.floor(totalLen / 8) - dataBytes;
  const correctable = model ? model.correctable : 2;
  const isDataModule = (i: number): boolean =>
    model ? (model.codewordIsData[Math.floor(i / 8)] ?? true) : i < dataBytes * 8;

  // Separate codewords: data plane lifts/blue-accent, EC plane lowers/red.
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

  // Damage → recover: corrupt a few codewords, then flash them back. RS
  // genuinely fixes up to `correctable` codeword errors.
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

  // Shield sphere removed — it rendered as a messy wireframe web.
  if (shield) shield.visible = false;

  const labels: LabelSpec[] = [];
  if (separateP > 0.5) {
    labels.push(
      { id: 'dm-data-label', text: `Data · ${dataBytes} bytes`, position: [-halfSize - 3, 1, -halfSize * 0.45], variant: 'data' },
      { id: 'dm-ec-label', text: `Error correction · ${ecBytes} bytes`, position: [-halfSize - 3, 1, halfSize * 0.45], variant: 'ec' },
    );
  }
  if (damageP > 0.3 && damageP < 0.7) {
    labels.push({ id: 'dm-damage-label', text: 'Damage detected', position: [-halfSize - 3, 1, 0], variant: 'warn' });
  }
  if (damageP > 0.7) {
    labels.push({ id: 'dm-repair-label', text: `Repaired — RS fixes up to ${correctable}`, position: [-halfSize - 3, 1, 0], variant: 'success' });
  }
  void DM_ACCENT_STRONG;
  return labels;
}

// Stage 4: Reveal the REAL decode units (each codeword → its real bits →
// its character), driven by the decode model. Each unit lights its own
// codeword modules and shows the genuine bits that became its letter.
function renderStage4(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, viz, halfSize } = ctx;
  const p = ctx.eased;
  const model = categorized.model;
  const readOrder = categorized.dataModuleIndices;

  const text = model ? model.decodedText : viz.decodedText;
  const units: { chars: string; bits: string; mods: number[] }[] = model
    ? model.symbols.map((s) => ({
        chars: s.chars,
        bits: s.bits,
        mods: s.codewords.flatMap((cw) => readOrder.slice(cw * 8, cw * 8 + 8)),
      }))
    : Array.from({ length: Math.min(viz.decodedText.length, 32) }, (_, i) => ({
        chars: viz.decodedText[i] ?? '',
        bits: '',
        mods: readOrder.slice(i * 8, i * 8 + 8),
      }));
  const maxUnits = Math.min(units.length, 32);

  const revealP = Math.min(1, p / 0.7);
  const unitProgress = revealP * maxUnits;
  const currentIdx = Math.min(Math.floor(unitProgress), maxUnits - 1);
  const cp = Math.max(0, Math.min(1, unitProgress - currentIdx));
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  for (const m of modules) {
    m._y = 0;
    m._r *= 0.22; m._g *= 0.22; m._b *= 0.22;
  }

  const labels: LabelSpec[] = [];
  let revealedChars = 0;

  for (let i = 0; i <= currentIdx; i++) {
    const u = units[i];
    if (!u) break;
    const isCurrent = i === currentIdx && revealP < 1;
    if (!isCurrent || cp > 0.5) revealedChars += u.chars.length;
    const cc = isCurrent ? DM_ACCENT : CREAM_RGB;
    const pulse = isCurrent ? 0.8 + 0.2 * Math.sin(performance.now() * 0.008) : 1.0;

    let cx = 0, cz = 0, count = 0;
    for (let b = 0; b < u.mods.length; b++) {
      const m = modules[u.mods[b]];
      m._r = cc.r * pulse;
      m._g = cc.g * pulse;
      m._b = cc.b * pulse;
      m._y = isCurrent ? 1.2 : 0.5;
      cx += m.col - halfSize + 0.5;
      cz += m.row - halfSize + 0.5;
      count++;
      // Show this unit's REAL bits over its modules during the read sub-phase.
      if (isCurrent && cp < 0.25 && b < u.bits.length) {
        labels.push({
          id: `dm-bit-${b}`,
          text: u.bits[b],
          position: [m.col - halfSize + 0.5, 2.0, m.row - halfSize + 0.5],
          variant: 'bit',
        });
      }
    }

    if (isCurrent && count > 0) {
      labels.push({
        id: 'current-char',
        text: `"${u.chars}"`,
        position: [cx / count, 3.0, cz / count],
        variant: 'char',
      });
    }
  }

  // Keep the L-finder at full black/white contrast so it stays recognizable.
  for (const m of modules) {
    if (m.cat === DmCat.LFinder) {
      if (m.val) {
        m._r = 0.04; m._g = 0.04; m._b = 0.05;
      } else {
        m._r = 0.85; m._g = 0.86; m._b = 0.9;
      }
    }
  }

  if (revealP >= 1) revealedChars = text.length;
  const shown = text.substring(0, Math.min(revealedChars, text.length));
  if (shown.length > 0 || finalP > 0) {
    labels.push({
      id: 'decoded-progress',
      text: finalP > 0 ? `"${text}"` : shown,
      position: finalP > 0 ? [0, 5, 0] : [0, 4.5, 0],
      variant: 'decoded',
    });
  }

  if (finalP > 0) {
    for (let i = labels.length - 1; i >= 0; i--) {
      const id = labels[i].id;
      if (id === 'current-char' || id.startsWith('dm-bit-')) labels.splice(i, 1);
    }
  }

  return labels;
}
