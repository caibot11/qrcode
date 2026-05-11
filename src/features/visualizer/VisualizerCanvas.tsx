import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { QrScene } from '@/scenes/QrScene';
import { DEMO_QR } from '@/lib/codes/qr/demo';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import styles from './VisualizerCanvas.module.css';

export function VisualizerCanvas() {
  const codeType = useAppStore((s) => s.codeType);
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const liveViz = useScanStore((s) => s.lastVizData);

  const qrViz = liveViz?.kind === 'qr' ? liveViz : DEMO_QR;

  // Camera distance scales with grid size; the scene is face-on now so the
  // camera lives mostly along Z. A tiny x/y offset gives subtle 3/4 depth
  // without distorting the code with strong perspective.
  const dist = qrViz.gridSize * 2.0;

  return (
    <div className={styles.canvasWrap}>
      <Canvas
        camera={{
          fov: 34,
          near: 0.1,
          far: 500,
          position: [dist * 0.09, dist * 0.05, dist * 0.99],
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          {codeType === 'qr' && (
            <QrScene
              viz={qrViz}
              stage={stage}
              autoPlay={autoPlay}
              onAdvance={setStage}
            />
          )}
        </Suspense>
        {/* Face-on orbit: kid can tilt slightly to see depth, can't go round the back. */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          enablePan={false}
          enableZoom={false}
          minDistance={qrViz.gridSize * 0.9}
          maxDistance={qrViz.gridSize * 2.5}
          minPolarAngle={Math.PI * 0.34}
          maxPolarAngle={Math.PI * 0.66}
          minAzimuthAngle={-Math.PI * 0.18}
          maxAzimuthAngle={Math.PI * 0.18}
        />
      </Canvas>
    </div>
  );
}
