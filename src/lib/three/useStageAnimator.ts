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
  /**
   * When true (default) the last stage loops back to stage 0. When false, the
   * last stage holds on its final frame and `onFinished` is fired once instead.
   */
  loop?: boolean;
  /** Called once when the last stage completes and `loop` is false. */
  onFinished?: () => void;
}

/**
 * Tracks per-stage progress in a ref (NOT React state) so the visualizer can
 * read it every frame without triggering re-renders. Handles auto-advance
 * between stages, looping (or a one-shot `onFinished`), and true play/pause:
 * when `autoPlay` is false the animation FREEZES in place and resumes from the
 * exact same point when it flips back to true.
 *
 * r3f re-invokes the `useFrame` callback with the latest closure every frame,
 * so reading `autoPlay`/`onAdvance`/`onFinished`/`loop` directly inside it is
 * safe — no stale values.
 */
export function useStageAnimator({
  stage,
  stageCount,
  durations,
  autoPlay,
  interStageDelay = 2500,
  onAdvance,
  loop = true,
  onFinished,
}: Options): React.RefObject<StageProgress> {
  const progressRef = useRef<StageProgress>({
    progress: 0,
    eased: 0,
    stage,
    animating: true,
  });
  const stageStartRef = useRef<number>(performance.now());
  const advanceTimerRef = useRef<number | null>(null);
  // Elapsed-at-pause; null means "running". While non-null the clock is frozen.
  const frozenElapsedRef = useRef<number | null>(null);
  // The current stage reached progress 1 but its completion action (advance /
  // loop / finish) hasn't run yet (e.g. it completed while paused).
  const pendingCompletionRef = useRef(false);
  // Guards onFinished so it fires exactly once per play-through.
  const finishedFiredRef = useRef(false);

  const clearAdvance = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  // Reset on stage change — a fresh stage always starts running from zero.
  useEffect(() => {
    stageStartRef.current = performance.now();
    progressRef.current.progress = 0;
    progressRef.current.eased = 0;
    progressRef.current.stage = stage;
    progressRef.current.animating = true;
    frozenElapsedRef.current = null;
    pendingCompletionRef.current = false;
    finishedFiredRef.current = false;
    clearAdvance();
  }, [stage]);

  // Clear any pending advance on unmount.
  useEffect(
    () => () => {
      clearAdvance();
    },
    [],
  );

  useFrame(() => {
    const ref = progressRef.current;
    const now = performance.now();
    const duration = durations[ref.stage] ?? 10000;

    // ---- Paused: freeze in place ----
    if (!autoPlay) {
      if (ref.animating && frozenElapsedRef.current === null) {
        frozenElapsedRef.current = Math.min(now - stageStartRef.current, duration);
      }
      // Don't let a queued auto-advance fire while paused; re-arm it on resume.
      if (advanceTimerRef.current !== null) {
        clearAdvance();
        pendingCompletionRef.current = true;
      }
      return;
    }

    // ---- Resuming: rebase the clock so progress continues from the freeze ----
    if (frozenElapsedRef.current !== null) {
      stageStartRef.current = now - frozenElapsedRef.current;
      frozenElapsedRef.current = null;
    }

    // ---- Advance progress ----
    if (ref.animating) {
      const raw = Math.min(1, (now - stageStartRef.current) / duration);
      ref.progress = raw;
      ref.eased = easeInOutCubic(raw);
      if (raw >= 1) {
        ref.animating = false;
        pendingCompletionRef.current = true;
      }
    }

    // ---- Run the completion action once (advance / loop / finish) ----
    if (pendingCompletionRef.current && advanceTimerRef.current === null) {
      pendingCompletionRef.current = false;
      const isLast = ref.stage + 1 >= stageCount;
      if (!isLast) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          onAdvance(ref.stage + 1);
        }, interStageDelay);
      } else if (loop) {
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          onAdvance(0);
        }, interStageDelay);
      } else if (!finishedFiredRef.current) {
        // Defer onFinished out of the useFrame call stack (like the advance /
        // loop branches above). It triggers a code-type change, and the TV's
        // <Canvas key={codeType}> remounts on that — doing the remount
        // synchronously *inside* the frame loop corrupts r3f's renderer (the
        // "shuffle/blob" when the attract loop wraps aztec → qr). The delay
        // also gives the final stage a proper hold before switching.
        advanceTimerRef.current = window.setTimeout(() => {
          advanceTimerRef.current = null;
          finishedFiredRef.current = true;
          onFinished?.();
        }, interStageDelay);
      }
    }
  });

  return progressRef;
}
