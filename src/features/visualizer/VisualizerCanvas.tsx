import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { QrScene } from '@/scenes/QrScene';
import { DatamatrixScene } from '@/scenes/DatamatrixScene';
import { AztecScene } from '@/scenes/AztecScene';
import { BarcodeScene } from '@/scenes/BarcodeScene';
import { DEMO_QR } from '@/lib/codes/qr/demo';
import { DEMO_DM } from '@/lib/codes/datamatrix/demo';
import { DEMO_AZTEC } from '@/lib/codes/aztec/demo';
import { DEMO_BARCODE } from '@/lib/codes/barcode/demo';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import styles from './VisualizerCanvas.module.css';

interface Props {
  /** Passed through to the active scene's stage animator. */
  loop?: boolean;
  onFinished?: () => void;
}

export function VisualizerCanvas({ loop, onFinished }: Props) {
  const codeType = useAppStore((s) => s.codeType);
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const liveViz = useScanStore((s) => s.lastVizData);

  // Pick the right demo + camera for the current code type.
  let initialPos: [number, number, number];
  let zoomMin: number;
  let zoomMax: number;

  if (codeType === 'barcode') {
    // Barcode is wider than it is tall; pull camera back so all bars fit.
    const w = DEMO_BARCODE.encoded.segments.reduce((s, x) => s + x.width, 0) + 20;
    initialPos = [w * 0.04, 13, w * 1.65];
    zoomMin = w * 0.9;
    zoomMax = w * 3;
  } else {
    const sz =
      codeType === 'datamatrix'
        ? DEMO_DM.gridSize
        : codeType === 'aztec'
          ? DEMO_AZTEC.gridSize
          : DEMO_QR.gridSize;
    const dist = sz * (codeType === 'aztec' ? 2.2 : 1.85);
    initialPos = [dist * 0.09, dist * 0.05, dist * 0.99];
    zoomMin = sz * 0.9;
    zoomMax = sz * 3.5;
  }

  return (
    <div className={styles.canvasWrap}>
      <Canvas
        camera={{
          fov: 34,
          near: 0.1,
          far: 500,
          position: initialPos,
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        key={codeType /* remount canvas when code type changes */}
      >
        <Suspense fallback={null}>
          {codeType === 'qr' && (
            <QrScene
              viz={liveViz?.kind === 'qr' ? liveViz : DEMO_QR}
              stage={stage}
              autoPlay={autoPlay}
              onAdvance={setStage}
              loop={loop}
              onFinished={onFinished}
            />
          )}
          {codeType === 'datamatrix' && (
            <DatamatrixScene
              viz={liveViz?.kind === 'datamatrix' ? liveViz : DEMO_DM}
              stage={stage}
              autoPlay={autoPlay}
              onAdvance={setStage}
              loop={loop}
              onFinished={onFinished}
            />
          )}
          {codeType === 'aztec' && (
            <AztecScene
              viz={liveViz?.kind === 'aztec' ? liveViz : DEMO_AZTEC}
              stage={stage}
              autoPlay={autoPlay}
              onAdvance={setStage}
              loop={loop}
              onFinished={onFinished}
            />
          )}
          {codeType === 'barcode' && (
            <BarcodeScene
              viz={liveViz?.kind === 'barcode' ? liveViz : DEMO_BARCODE}
              stage={stage}
              autoPlay={autoPlay}
              onAdvance={setStage}
              loop={loop}
              onFinished={onFinished}
            />
          )}
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          enablePan={false}
          enableZoom={false}
          minDistance={zoomMin}
          maxDistance={zoomMax}
          minPolarAngle={Math.PI * 0.34}
          maxPolarAngle={Math.PI * 0.66}
          minAzimuthAngle={-Math.PI * 0.18}
          maxAzimuthAngle={Math.PI * 0.18}
        />
      </Canvas>
    </div>
  );
}
