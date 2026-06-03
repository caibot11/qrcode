import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BarcodeModule } from '@/lib/codes/barcode/categorize';

interface Props {
  modulesRef: React.RefObject<BarcodeModule[]>;
}

/**
 * Bars for a 1D code (Code 128). Each instance is a vertical pillar whose
 * height (scaleY) and width (scaleX = bar width in module units) varies per
 * segment. Position.y = scaleY/2 so the bottom of each bar sits at y=0.
 *
 * Spaces stay short (scaleY ≈ 1) and dim — they're visible as a thin baseline
 * between bars so the scanner-sweep / character-grouping animations can color
 * them without rebuilding geometry.
 */
export function InstancedBars({ modulesRef }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = modulesRef.current?.length ?? 0;

  const scratch = useMemo(
    () => ({
      mat4: new THREE.Matrix4(),
      scaleM: new THREE.Matrix4(),
      transM: new THREE.Matrix4(),
      color: new THREE.Color(),
    }),
    [],
  );

  // Seed the instanceColor buffer once on mount.
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

    const { mat4, scaleM, transM, color } = scratch;
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      const sy = Math.max(0.05, m._scaleY);
      transM.makeTranslation(m.xCenter, sy * 0.5 + m._y, 0);
      scaleM.makeScale(m.width, sy, 1);
      mat4.multiplyMatrices(transM, scaleM);
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
      <boxGeometry args={[1, 1, 1]} />
      {/* Unlit so bar colours render exactly as set (no warm-light wash). */}
      <meshBasicMaterial toneMapped={false} fog={false} />
    </instancedMesh>
  );
}
