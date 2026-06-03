import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface GridModule {
  row: number;
  col: number;
  _y: number;
  _r: number;
  _g: number;
  _b: number;
  _scaleY?: number;
}

interface Props {
  /** ref to the live module array; mutated externally each frame */
  modulesRef: React.RefObject<GridModule[]>;
  gridSize: number;
  /** size of each box in world units. defaults to 0.85 × 0.18 × 0.85 */
  boxSize?: [number, number, number];
}

/**
 * Imperative InstancedMesh wrapper. Each frame it walks the live module
 * array (provided as a ref so we never re-render this component) and writes
 * per-instance matrix + color into the GPU buffers.
 */
export function InstancedGrid({
  modulesRef,
  gridSize,
  boxSize = [0.85, 0.18, 0.85],
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const count = modulesRef.current?.length ?? 0;
  const halfSize = gridSize / 2;

  // Reusable scratch objects — allocate once per mount.
  const scratch = useMemo(
    () => ({
      mat4: new THREE.Matrix4(),
      scale: new THREE.Matrix4(),
      color: new THREE.Color(),
    }),
    [],
  );

  // Initialize colors once so the instanceColor buffer is created.
  useEffect(() => {
    const mesh = meshRef.current;
    const mods = modulesRef.current;
    if (!mesh || !mods) return;
    for (let i = 0; i < mods.length; i++) {
      scratch.color.setRGB(0.78, 0.8, 0.84);
      mesh.setColorAt(i, scratch.color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [modulesRef, scratch]);

  useFrame(() => {
    const mesh = meshRef.current;
    const mods = modulesRef.current;
    if (!mesh || !mods) return;

    const { mat4, scale, color } = scratch;
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      mat4.makeTranslation(
        m.col - halfSize + 0.5,
        m._y,
        m.row - halfSize + 0.5,
      );
      const sy = m._scaleY ?? 1;
      if (sy !== 1) {
        scale.makeScale(1, sy, 1);
        mat4.multiply(scale);
      }
      mesh.setMatrixAt(i, mat4);
      color.setRGB(m._r, m._g, m._b);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={boxSize} />
      {/* Unlit + no tonemapping/fog so module colours render exactly as set —
          the warm scene lights were washing them out to a pale grey filter. */}
      <meshBasicMaterial toneMapped={false} fog={false} />
    </instancedMesh>
  );
}
