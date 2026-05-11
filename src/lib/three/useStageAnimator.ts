import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { easeInOutCubic } from '@/lib/codes/qr/helpers';

export interface StageProgress {
  /** raw progress in [0..1] */
  progress: number;
  /** eased progress (easeInOutCubic) in [0..1] */
  eased: number;
  /** stage index this progress belongs to (for consumers detecting transitions) */
  stage: number;
  /** true while currently animating; false once progress reaches 1 */
  animating: boolean;
}

interface Options {
  stage: number;
  stageCount: number;
  durations: readonly number[];
  autoPlay: boolean;
  /** ms to wait between stages when auto-advancing */
  interStageDelay?: number;
  onAdvance: (newStage: number) => void;
}

/**
 * Tracks per-stage progress in a ref (NOT React state) so the visualizer can
 * read it every frame without triggering re-renders. Handles auto-advance
 * between stages and looping back to stage 0 at the end.
 */
export function useStageAnimator({
  stage,
  stageCount,
  durations,
  autoPlay,
  interStageDelay = 2500,
  onAdvance,
}: Options): React.RefObject<StageProgress> {
  const progressRef = useRef<StageProgress>({
    progress: 0,
    eased: 0,
    stage,
    animating: true,
  });
  const stageStartRef = useRef<number>(performance.now());
  const advanceTimerRef = useRef<number | null>(null);

  // Reset on stage change.
  useEffect(() => {
    stageStartRef.current = performance.now();
    progressRef.current.progress = 0;
    progressRef.current.eased = 0;
    progressRef.current.stage = stage;
    progressRef.current.animating = true;
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, [stage]);

  // Clear any pending advance on unmount.
  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    },
    [],
  );

  useFrame(() => {
    const ref = progressRef.current;
    if (!ref.animating) return;

    const duration = durations[ref.stage] ?? 10000;
    const elapsed = performance.now() - stageStartRef.current;
    const raw = Math.min(1, elapsed / duration);
    ref.progress = raw;
    ref.eased = easeInOutCubic(raw);

    if (raw >= 1) {
      ref.animating = false;
      if (autoPlay && advanceTimerRef.current === null) {
        const next = ref.stage + 1 >= stageCount ? 0 : ref.stage + 1;
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          onAdvance(next);
        }, interStageDelay);
      }
    }
  });

  return progressRef;
}
