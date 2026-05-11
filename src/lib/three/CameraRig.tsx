import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface CameraGoal {
  position: [number, number, number];
  target: [number, number, number];
}

interface Props {
  goalRef: React.RefObject<CameraGoal>;
  /** time constant for the exponential lerp; lower = snappier */
  smoothness?: number;
}

/**
 * Smoothly drives the active camera toward `goalRef.current`. The goal is
 * read from a ref each frame so consumers can mutate it without re-rendering.
 * Pairs with drei's <OrbitControls makeDefault /> — we update both the camera
 * position and the controls' target.
 */
export function CameraRig({ goalRef, smoothness = 0.05 }: Props) {
  const { camera, controls } = useThree();
  const lastTime = useRef(performance.now());
  const tmpPos = useRef(new THREE.Vector3());
  const tmpTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    const goal = goalRef.current;
    if (!goal) return;

    const now = performance.now();
    const dt = (now - lastTime.current) / 1000;
    lastTime.current = now;
    const lerpAmt = 1 - Math.pow(smoothness, dt);

    tmpPos.current.set(...goal.position);
    camera.position.lerp(tmpPos.current, lerpAmt);

    tmpTarget.current.set(...goal.target);
    // drei OrbitControls exposes its target via `controls.target`.
    const c = controls as unknown as { target?: THREE.Vector3 } | null;
    if (c?.target) {
      c.target.lerp(tmpTarget.current, lerpAmt);
    }
  });

  return null;
}
