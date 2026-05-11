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

  return (
    <div className={styles.canvasWrap}>
      <Canvas
        camera={{ fov: 50, near: 0.1, far: 500, position: [20, 22, 20] }}
        gl={{ antialias: true, alpha: false }}
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
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.35}
          minDistance={qrViz.gridSize * 0.4}
          maxDistance={qrViz.gridSize * 3.5}
          minPolarAngle={Math.PI * 0.05}
          maxPolarAngle={Math.PI * 0.85}
          screenSpacePanning
        />
      </Canvas>
    </div>
  );
}
