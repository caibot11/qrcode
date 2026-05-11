import * as THREE from 'three';
import { useMemo } from 'react';

interface Props {
  gridSize: number;
}

/**
 * Lights + ground plane + fog — extracted from legacy BaseVisualizer._setupScene.
 */
export function SceneEnvironment({ gridSize }: Props) {
  const fogColor = useMemo(() => new THREE.Color(0x0a0e1a), []);

  return (
    <>
      <fogExp2 attach="fog" args={[fogColor, 0.006]} />
      <color attach="background" args={['#0a0e1a']} />

      <ambientLight color={0x404060} intensity={1.2} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} color={0xffffff} />
      <directionalLight position={[-10, 10, -10]} intensity={0.4} color={0x4488ff} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.15, 0]}>
        <planeGeometry args={[gridSize * 2 + 10, gridSize * 2 + 10]} />
        <meshStandardMaterial
          color={0x0d1117}
          transparent
          opacity={0.6}
          roughness={1}
        />
      </mesh>
    </>
  );
}
