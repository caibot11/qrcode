import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { decodeFrame } from '@/lib/scan/decodeFrame';
import type { VizData } from '@/lib/codes/types';
import { useT } from '@/locales/useT';
import styles from './CameraScanner.module.css';

// Decode budget: try at most this often (ms). Decoding every frame is wasteful
// and jsQR + ZXing on a 640px frame is plenty responsive at ~8 fps.
const DECODE_INTERVAL = 120;
// Downscale frames to this max width before decoding. Higher = more pixels per
// module → more accurate grid extraction (at a modest per-frame cost).
const DECODE_MAX_WIDTH = 960;

interface Props {
  /**
   * Called with the decoded result on a hit. When provided, the scanner does
   * NOT write the app/visualizer stores (the scan page forwards the result over
   * the sync channel instead). When omitted, it falls back to driving the local
   * stores directly.
   */
  onDecode?: (viz: VizData) => void;
  /** 'pip' = small picture-in-picture (default); 'full' = fill the parent. */
  variant?: 'pip' | 'full';
}

export function CameraScanner({ onDecode, variant = 'pip' }: Props) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scanState = useScanStore((s) => s.scanState);
  const lastError = useScanStore((s) => s.lastError);

  // Read mutable values through refs so the rAF loop never goes stale and the
  // effect doesn't need to re-run when they change.
  const scanStateRef = useRef(scanState);
  scanStateRef.current = scanState;
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let rafId = 0;
    let lastDecode = 0;
    let cancelled = false;

    const {
      setScanState,
      setLastVizData,
      setLastError,
    } = useScanStore.getState();
    const { setCodeType, setStage, setAutoPlay } = useAppStore.getState();

    const tick = () => {
      rafId = requestAnimationFrame(tick);

      // Pause detection while a result is on screen; the camera keeps running.
      if (scanStateRef.current === 'decoded') return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;

      const now = performance.now();
      if (now - lastDecode < DECODE_INTERVAL) return;
      lastDecode = now;

      const scale = Math.min(1, DECODE_MAX_WIDTH / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      // Clear before drawing so no stale pixels from a prior frame survive.
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, 0, 0, w, h);

      let frame: ImageData;
      try {
        frame = ctx.getImageData(0, 0, w, h);
      } catch {
        return;
      }

      const viz = decodeFrame(frame);
      if (!viz) return;

      // Hit.
      if (onDecodeRef.current) {
        onDecodeRef.current(viz);
      } else {
        setLastVizData(viz);
        setCodeType(viz.kind);
        setStage(0);
        setAutoPlay(true);
      }
      setScanState('decoded');
    };

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setLastError(null);
        if (scanStateRef.current !== 'decoded') setScanState('scanning');
        rafId = requestAnimationFrame(tick);
      } catch (err) {
        setLastError(
          err instanceof Error ? err.message : 'Camera unavailable',
        );
        setScanState('error');
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  return (
    <div
      className={`${styles.wrap} ${variant === 'full' ? styles.full : ''}`}
      data-state={scanState}
      aria-hidden
    >
      <video ref={videoRef} className={styles.video} muted playsInline />
      <canvas ref={canvasRef} className={styles.hiddenCanvas} />
      <div className={styles.frame} />
      <div className={styles.caption}>
        {scanState === 'error'
          ? lastError || t('scan.error')
          : scanState === 'decoded'
            ? t('scan.decoded')
            : t('scan.hint')}
      </div>
    </div>
  );
}
