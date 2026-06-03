import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraScanner } from '@/features/scan/CameraScanner';
import { ControlBar } from '@/features/scan/ControlBar';
import { Brand } from '@/components/Brand';
import { useScanStore } from '@/stores/useScanStore';
import { useSyncChannel } from '@/lib/sync/useSyncChannel';
import type { DisplayState, SyncMessage } from '@/lib/sync/channel';
import type { CodeKind, VizData } from '@/lib/codes/types';
import { useT } from '@/locales/useT';
import shell from './AppShell.module.css';
import styles from './ScanApp.module.css';

// Hold the finished animation on the TV this long before returning to scanning.
const AUTO_RESET_SECONDS = 6;

// Code-type order for arrow-key cycling on the scan page.
const CODE_ORDER: CodeKind[] = ['qr', 'barcode', 'datamatrix', 'aztec'];

/**
 * The laptop scan page (`/scan`). Owns the camera, all operator controls, and
 * the auto-reset countdown. Decodes a code, pushes it to the TV over the sync
 * channel, and drives the TV remotely.
 */
export function ScanApp() {
  const { t, locale, setLocale } = useT();
  const scanState = useScanStore((s) => s.scanState);

  // Latest locale for the keyboard handler (avoids re-binding the listener).
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const [displayState, setDisplayState] = useState<DisplayState | null>(null);
  const [decodedText, setDecodedText] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const postRef = useRef<(m: SyncMessage) => void>(() => {});
  const intervalRef = useRef<number | null>(null);
  const deadlineRef = useRef(0);

  const clearCountdown = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Return this page to scanning (no broadcast) — shared by the scan-again
  // button and an incoming 'reset' from the TV's keyboard.
  const resetScanLocal = useCallback(() => {
    clearCountdown();
    setCountdown(null);
    setDecodedText(null);
    useScanStore.getState().setScanState('scanning');
  }, [clearCountdown]);

  const doReset = useCallback(() => {
    resetScanLocal();
    postRef.current({ type: 'reset' });
  }, [resetScanLocal]);

  const startCountdown = useCallback(() => {
    clearCountdown();
    deadlineRef.current = performance.now() + AUTO_RESET_SECONDS * 1000;
    setCountdown(AUTO_RESET_SECONDS);
    intervalRef.current = window.setInterval(() => {
      const remainMs = deadlineRef.current - performance.now();
      if (remainMs <= 0) {
        doReset();
        return;
      }
      setCountdown(Math.ceil(remainMs / 1000));
    }, 250);
  }, [clearCountdown, doReset]);

  const handleMessage = useCallback(
    (m: SyncMessage) => {
      switch (m.type) {
        case 'state':
          setDisplayState(m.state);
          break;
        case 'animationComplete':
          startCountdown();
          break;
        case 'reset':
          // TV (or its keyboard) reset → resume scanning here too.
          resetScanLocal();
          break;
      }
    },
    [startCountdown, resetScanLocal],
  );

  const post = useSyncChannel(handleMessage);
  useEffect(() => {
    postRef.current = post;
  }, [post]);

  // Ask the TV for its current state on mount (handles opening /scan second).
  useEffect(() => {
    post({ type: 'requestState' });
  }, [post]);

  // Clean up the countdown timer on unmount (StrictMode-safe).
  useEffect(() => () => clearCountdown(), [clearCountdown]);

  // Keep the TV in the same language as the operator's screen.
  useEffect(() => {
    post({ type: 'setLocale', locale });
  }, [post, locale]);

  const handleDecode = useCallback(
    (viz: VizData) => {
      setDecodedText(viz.decodedText);
      postRef.current({ type: 'show', viz });
    },
    [],
  );

  const playing = displayState?.autoPlay ?? true;
  const tvCodeType: CodeKind = displayState?.codeType ?? 'qr';

  const onPlayPause = useCallback(() => {
    postRef.current({ type: playing ? 'pause' : 'play' });
  }, [playing]);

  const onSetCodeType = useCallback(
    (kind: CodeKind) => {
      resetScanLocal();
      postRef.current({ type: 'setCodeType', kind });
    },
    [resetScanLocal],
  );

  // Keyboard control so the operator never needs the trackpad:
  //   ← / →  switch code type   ·   Space  play/pause   ·   R / Enter / Esc  rescan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const onButton = tag === 'BUTTON' || tag === 'INPUT';

      // 1–5 (top row or numpad) jump straight to that stage. All code types
      // have 5 stages, so clamp to 0–4.
      const digit =
        e.key >= '1' && e.key <= '5'
          ? Number(e.key)
          : /^Numpad[1-5]$/.test(e.code)
            ? Number(e.code.slice(6))
            : 0;
      if (digit) {
        e.preventDefault();
        postRef.current({ type: 'setStage', stage: digit - 1 });
        return;
      }

      const step = (dir: number) => {
        const i = CODE_ORDER.indexOf(tvCodeType);
        const next = (i + dir + CODE_ORDER.length) % CODE_ORDER.length;
        onSetCodeType(CODE_ORDER[next]);
      };
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          step(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          step(-1);
          break;
        case ' ':
          if (onButton) break; // let a focused button handle its own Space
          e.preventDefault();
          onPlayPause();
          break;
        case 'r':
        case 'R':
        case 'Escape':
          e.preventDefault();
          doReset();
          break;
        case 'Enter':
          if (onButton) break;
          e.preventDefault();
          doReset();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setLocale(localeRef.current === 'en' ? 'nl' : 'en');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tvCodeType, onSetCodeType, onPlayPause, doReset, setLocale]);

  const decoded = scanState === 'decoded';

  return (
    <div className={shell.shell} data-code-type={tvCodeType}>
      <div className={shell.warmGlow} aria-hidden />
      <div className={styles.page}>
        <div className={styles.brandSlot}>
          <Brand />
        </div>

        <div className={styles.head}>
          <h1 className={styles.headline}>{t('attract.cta')}</h1>
          <p className={styles.sub}>{t('scan.subtitle')}</p>
        </div>

        <div className={styles.cameraBox} data-decoded={decoded}>
          <CameraScanner variant="full" onDecode={handleDecode} />
          {decoded && (
            <div className={styles.result}>
              <div className={styles.resultText}>
                <span className={styles.resultLabel}>{t('scan.decodedPrefix')}</span>
                <span className={styles.resultValue}>{decodedText}</span>
              </div>
              <div className={styles.resultMeta}>
                {t('scan.onBigScreen')}
                {countdown !== null && (
                  <span className={styles.countdown}>
                    {' '}
                    · {t('scan.resettingIn')} {countdown}s
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <ControlBar
          playing={playing}
          onPlayPause={onPlayPause}
          onScanAgain={doReset}
          codeType={tvCodeType}
          onSetCodeType={onSetCodeType}
        />

        <p className={styles.kbdHint}>{t('scan.kbdHint')}</p>
      </div>
    </div>
  );
}
