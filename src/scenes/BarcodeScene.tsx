import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BarcodeVizData } from '@/lib/codes/types';
import {
  categorizeBarcode,
  BAR_TARGET_HEIGHT,
  type BarcodeCategorized,
  type BarcodeModule,
} from '@/lib/codes/barcode/categorize';
import { BARCODE_STAGES } from '@/lib/codes/barcode/config';
import { easeOutCubic, lerp } from '@/lib/codes/qr/helpers';
import {
  ACCENT_RGB,
  CREAM_RGB,
  WARN_RGB,
} from '@/lib/codes/accents';
import { InstancedBars } from '@/lib/three/InstancedBars';
import { CameraRig, type CameraGoal } from '@/lib/three/CameraRig';
import { SceneEnvironment } from '@/lib/three/SceneEnvironment';
import { StageLabels, type LabelSpec } from '@/lib/three/StageLabels';
import { useStageAnimator } from '@/lib/three/useStageAnimator';

const BC_ACCENT = ACCENT_RGB.barcode;

interface Props {
  viz: BarcodeVizData;
  stage: number;
  autoPlay: boolean;
  onAdvance: (newStage: number) => void;
}

export function BarcodeScene({ viz, stage, autoPlay, onAdvance }: Props) {
  const categorized = useMemo(() => categorizeBarcode(viz), [viz]);
  const modulesRef = useRef<BarcodeModule[]>(categorized.modules);

  useEffect(() => {
    modulesRef.current = categorized.modules;
  }, [categorized]);

  const defaultGoal = useMemo<CameraGoal>(() => {
    const w = categorized.totalWidth;
    return {
      position: [w * 0.04, BAR_TARGET_HEIGHT * 0.5, w * 1.65],
      target: [0, BAR_TARGET_HEIGHT * 0.45, 0],
    };
  }, [categorized.totalWidth]);

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

  // Extras: scanner laser line
  const laserRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    setLabels([]);
    labelsKeyRef.current = '';
    if (laserRef.current) laserRef.current.visible = false;
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
    stageCount: BARCODE_STAGES.length,
    durations: BARCODE_STAGES.map((s) => s.duration),
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
      laser: laserRef.current,
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

  // Laser geometry size derived once.
  const laserWidth = useMemo(() => categorized.totalWidth * 1.05, [
    categorized.totalWidth,
  ]);

  return (
    <>
      <SceneEnvironment />
      <CameraRig goalRef={cameraGoalRef} />

      <InstancedBars modulesRef={modulesRef} />
      <StageLabels labels={labels} />

      {/* Scanner laser bar — visible during stage 2 */}
      <mesh ref={laserRef} visible={false} position={[0, 0, 1]}>
        <boxGeometry args={[laserWidth, 0.25, 0.6]} />
        <meshBasicMaterial
          color={'#ff3a3a'}
          transparent
          opacity={0}
        />
      </mesh>
    </>
  );
}

interface Ctx {
  modules: BarcodeModule[];
  categorized: BarcodeCategorized;
  viz: BarcodeVizData;
  eased: number;
  raw: number;
  laser: THREE.Mesh | null;
}

function setDefaultColors(modules: BarcodeModule[]): void {
  for (const m of modules) {
    if (m.isBar) {
      m._r = 0.78; m._g = 0.8; m._b = 0.84;
    } else {
      m._r = 0.16; m._g = 0.13; m._b = 0.10;
    }
    m._scaleY = 1;
    m._y = 0;
  }
}

function labelsKey(labels: LabelSpec[]): string {
  let out = '';
  for (const l of labels) {
    out += `${l.id}|${l.text}|${l.position[0].toFixed(2)},${l.position[1].toFixed(2)},${l.position[2].toFixed(2)}|${l.variant ?? 'd'}||`;
  }
  return out;
}

// Stage 0: Bars rise into pillars left-to-right, guards glow.
function renderStage0(ctx: Ctx): LabelSpec[] {
  const { modules, categorized } = ctx;
  const p = ctx.eased;
  const sc = BC_ACCENT;
  const riseP = Math.min(1, p / 0.6);
  const guardP = Math.max(0, Math.min(1, (p - 0.3) / 0.3));
  const labelP = Math.max(0, Math.min(1, (p - 0.7) / 0.3));
  const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);

  const totalSegments = modules.length;

  for (const m of modules) {
    const frac = m.index / totalSegments;
    const delay = frac * 0.7;
    const localP = Math.max(0, Math.min(1, (riseP - delay) / (1 - delay)));
    const ep = easeOutCubic(localP);

    if (m.isBar) {
      m._scaleY = lerp(1, BAR_TARGET_HEIGHT, ep);
    } else {
      m._scaleY = 1;
    }

    if (m.isGuard && guardP > 0 && m.isBar) {
      const glow = guardP * (0.8 + 0.2 * glowPulse);
      m._r = lerp(m._r, sc.r * glow, guardP);
      m._g = lerp(m._g, sc.g * glow, guardP);
      m._b = lerp(m._b, sc.b * glow, guardP);
      m._scaleY *= 1 + guardP * 0.15;
    }
  }

  const labels: LabelSpec[] = [];
  if (labelP > 0) {
    // Find centers of first and last group bars.
    const startBars = modules.filter((m) => m.groupIndex === 0 && m.isBar);
    const stopBars = modules.filter(
      (m) => m.groupIndex === categorized.checkGroupIndex + 1 && m.isBar,
    );
    if (startBars.length > 0) {
      const avg = startBars.reduce((s, m) => s + m.xCenter, 0) / startBars.length;
      labels.push({
        id: 'start-guard',
        text: 'Start guard',
        position: [avg, BAR_TARGET_HEIGHT + 4, 0],
      });
    }
    if (stopBars.length > 0) {
      const avg = stopBars.reduce((s, m) => s + m.xCenter, 0) / stopBars.length;
      labels.push({
        id: 'stop-guard',
        text: 'Stop guard',
        position: [avg, BAR_TARGET_HEIGHT + 4, 0],
      });
    }
  }
  return labels;
}

// Stage 1: Highlight each character group in sequence.
function renderStage1(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, viz } = ctx;
  const p = ctx.eased;
  const sc = BC_ACCENT;
  const groupCount = categorized.checkGroupIndex + 2; // include start..stop
  const highlightGroup = Math.floor(p * groupCount * 1.15);

  for (const m of modules) {
    if (m.isBar) {
      m._scaleY = BAR_TARGET_HEIGHT;
    }
  }

  for (const m of modules) {
    if (m.groupIndex === highlightGroup || m.groupIndex === highlightGroup - 1) {
      const intensity = m.groupIndex === highlightGroup ? 1.0 : 0.4;
      if (m.isBar) {
        m._r = lerp(m._r, sc.r, intensity);
        m._g = lerp(m._g, sc.g, intensity);
        m._b = lerp(m._b, sc.b, intensity);
      }
      if (m.groupIndex === highlightGroup && m.isBar) {
        m._scaleY *= 1.15;
      }
    } else {
      m._r *= 0.45; m._g *= 0.45; m._b *= 0.45;
    }
  }

  const labels: LabelSpec[] = [];
  if (highlightGroup < groupCount) {
    const groupSegs = modules.filter((m) => m.groupIndex === highlightGroup);
    if (groupSegs.length > 0) {
      const cx =
        groupSegs.reduce((s, m) => s + m.xCenter, 0) / groupSegs.length;
      const widths = groupSegs.map((m) => m.width).join('-');
      const lbl =
        viz.encoded.segments.find((s) => s.groupIndex === highlightGroup)
          ?.groupLabel ?? '?';
      labels.push({
        id: 'width-pattern',
        text: `"${lbl}" [${widths}]`,
        position: [cx, BAR_TARGET_HEIGHT + 4, 0],
      });
    }
  }
  return labels;
}

// Stage 2: Red laser sweeps left to right.
function renderStage2(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, laser } = ctx;
  const p = ctx.eased;

  const sweepP = Math.max(0, Math.min(1, p / 0.8));
  const fadeP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  const halfW = categorized.totalWidth / 2;
  const leftX = -halfW - 2;
  const rightX = halfW + 2;
  const laserX = lerp(leftX, rightX, sweepP);

  for (const m of modules) {
    if (m.isBar) m._scaleY = BAR_TARGET_HEIGHT;
  }

  // Show laser strip just in front of bars.
  if (laser) {
    laser.visible = true;
    laser.position.set(laserX, BAR_TARGET_HEIGHT * 0.5, 1.2);
    (laser.material as THREE.MeshBasicMaterial).opacity = (1 - fadeP) * 0.9;
  }

  // Light up bars as the laser passes.
  for (const m of modules) {
    if (m.xCenter < laserX && m.isBar) {
      const dist = laserX - m.xCenter;
      const brightness = Math.max(0.3, 1 - dist / 14);
      m._r = lerp(m._r, 1.0, brightness);
      m._g = lerp(m._g, 0.25, brightness);
      m._b = lerp(m._b, 0.25, brightness);
    }
  }

  // Show bits near the laser.
  const labels: LabelSpec[] = [];
  const near = modules
    .filter((m) => Math.abs(m.xCenter - laserX) < 2.5)
    .slice(0, 4);
  for (let i = 0; i < near.length; i++) {
    const m = near[i];
    labels.push({
      id: `scan-bit-${i}`,
      text: m.isBar ? '1' : '0',
      position: [m.xCenter, BAR_TARGET_HEIGHT + 2, 0],
      variant: 'bit',
    });
  }
  return labels;
}

// Stage 3: Highlight the check digit group + verify flash.
function renderStage3(ctx: Ctx): LabelSpec[] {
  const { modules, categorized, viz } = ctx;
  const p = ctx.eased;
  const calcP = Math.min(1, p / 0.5);
  const flashP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  for (const m of modules) {
    if (m.isBar) m._scaleY = BAR_TARGET_HEIGHT;
  }

  const warn = WARN_RGB;
  for (const m of modules) {
    if (m.groupIndex === categorized.checkGroupIndex && m.isBar) {
      m._scaleY *= 1 + calcP * 0.25;
      if (flashP > 0) {
        // green flash on verify
        m._r = lerp(warn.r, 0.36, flashP);
        m._g = lerp(warn.g, 0.83, flashP);
        m._b = lerp(warn.b, 0.62, flashP);
      } else {
        m._r = warn.r; m._g = warn.g; m._b = warn.b;
      }
    } else {
      m._r *= 0.45; m._g *= 0.45; m._b *= 0.45;
    }
  }

  const labels: LabelSpec[] = [];
  if (calcP > 0.3) {
    const checkSegs = modules.filter(
      (m) => m.groupIndex === categorized.checkGroupIndex,
    );
    if (checkSegs.length > 0) {
      const cx =
        checkSegs.reduce((s, m) => s + m.xCenter, 0) / checkSegs.length;
      labels.push({
        id: 'check-label',
        text: `Check digit: ${viz.encoded.checkDigit}`,
        position: [cx, BAR_TARGET_HEIGHT + 4, 0],
        variant: 'warn',
      });
    }
  }
  if (flashP > 0.5) {
    labels.push({
      id: 'verify-label',
      text: 'Verified!',
      position: [0, BAR_TARGET_HEIGHT + 7, 0],
      variant: 'success',
    });
  }
  return labels;
}

// Stage 4: Reveal each character — its bar group lights up in accent then settles to cream.
function renderStage4(ctx: Ctx): LabelSpec[] {
  const { modules, viz } = ctx;
  const p = ctx.eased;
  const text = viz.decodedText;
  const charCount = text.length;

  const revealP = Math.min(1, p / 0.7);
  const charsRevealed = Math.floor(revealP * (charCount + 0.999));
  const finalP = Math.max(0, Math.min(1, (p - 0.8) / 0.2));

  for (const m of modules) {
    if (m.isBar) m._scaleY = BAR_TARGET_HEIGHT;
    m._r *= 0.32; m._g *= 0.32; m._b *= 0.32;
  }

  const currentCharIdx = Math.min(charsRevealed, charCount) - 1;
  const labels: LabelSpec[] = [];

  for (let i = 0; i < Math.min(charsRevealed, charCount); i++) {
    const groupIdx = i + 1; // +1 because index 0 is Start
    const isCurrent = i === currentCharIdx && revealP < 1;
    const cc = isCurrent ? BC_ACCENT : CREAM_RGB;
    const pulse = isCurrent ? 0.8 + 0.2 * Math.sin(performance.now() * 0.008) : 1.0;

    const groupSegs = modules.filter((m) => m.groupIndex === groupIdx);
    for (const m of groupSegs) {
      if (m.isBar) {
        m._r = cc.r * pulse;
        m._g = cc.g * pulse;
        m._b = cc.b * pulse;
        if (isCurrent) {
          m._scaleY *= 1.2;
        }
      } else {
        m._r = cc.r * 0.18;
        m._g = cc.g * 0.18;
        m._b = cc.b * 0.18;
      }
    }

    if (groupSegs.length > 0) {
      const cx = groupSegs.reduce((s, m) => s + m.xCenter, 0) / groupSegs.length;
      labels.push({
        id: `char-decode-${i}`,
        text: text[i],
        position: [cx, BAR_TARGET_HEIGHT + 3, 0],
        variant: isCurrent ? 'char' : 'decoded',
      });
    }
  }

  // Guards stay faintly visible.
  for (const m of modules) {
    if (m.isGuard && m.isBar) {
      m._r = Math.max(m._r, 0.28);
      m._g = Math.max(m._g, 0.28);
      m._b = Math.max(m._b, 0.32);
    }
  }

  if (finalP > 0) {
    labels.push({
      id: 'decoded-text',
      text: `"${text}"`,
      position: [0, BAR_TARGET_HEIGHT + 8, 0],
      variant: 'decoded',
    });
  }

  return labels;
}
