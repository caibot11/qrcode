import { useMemo } from 'react';
import * as THREE from 'three';

interface Props {
  /** background tint hex string, e.g. '#171008' */
  background?: string;
  fogDensity?: number;
}

/**
 * Lights + atmosphere for a front-facing kiosk scene. No floor plane —
 * the code hangs in space like a museum exhibit lit from the front.
 */
export function SceneEnvironment({
  background = '#171008',
  fogDensity = 0.004,
}: Props) {
  const fogColor = useMemo(() => new THREE.Color(background), [background]);

  return (
    <>
      <fogExp2 attach="fog" args={[fogColor, fogDensity]} />

      {/* Lower ambient + key so per-module colours aren't washed out to pale
          on the bright (light) modules — keeps dark vs light contrast crisp. */}
      <ambientLight color={0x6a5236} intensity={0.6} />
      {/* Key — warm light from upper-left front */}
      <directionalLight position={[-6, 8, 12]} intensity={1.05} color={'#fff0d6'} />
      {/* Fill — cooler bounce from below-right */}
      <directionalLight position={[8, -4, 6]} intensity={0.35} color={'#7ab8ff'} />
      {/* Rim — cool from behind to separate code from background */}
      <directionalLight position={[0, 0, -10]} intensity={0.5} color={'#a8b8d4'} />
    </>
  );
}
