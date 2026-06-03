import { useCallback, useEffect, useRef } from 'react';
import { VisualizerCanvas } from '@/features/visualizer/VisualizerCanvas';
import { InfoCard } from '@/features/visualizer/InfoCard';
import { ProgressIndicator } from '@/features/visualizer/ProgressIndicator';
import { Brand } from '@/components/Brand';
import { CodeTypeBar } from '@/components/CodeTypeBar';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { useT } from '@/locales/useT';
import { useSyncChannel } from '@/lib/sync/useSyncChannel';
import type { DisplayState, SyncMessage } from '@/lib/sync/channel';
import { STAGES_BY_KIND } from '@/lib/codes/registry';
import type { CodeKind } from '@/lib/codes/types';
import shell from './AppShell.module.css';
import styles from './DisplayApp.module.css';

// Order the attract loop cycles through when no real code is on screen.
const ATTRACT_ORDER: CodeKind[] = ['qr', 'barcode', 'datamatrix', 'aztec'];

function buildState(): DisplayState {
  const app = useAppStore.getState();
  const viz = useScanStore.getState().lastVizData;
  const stageCount = STAGES_BY_KIND[app.codeType].length;
  const decodedText =
    app.mode === 'live' && viz?.kind === app.codeType ? viz.decodedText : null;
  return {
    mode: app.mode,
    codeType: app.codeType,
    stage: app.stage,
    stageCount,
    autoPlay: app.autoPlay,
    decodedText,
  };
}

/**
 * The TV display page (`/`). Pure output: 3D animation + info + read-only
 * progress. No camera, no controls. Receives commands from the laptop scan
 * page over the sync channel and runs an attract<->live state machine.
 */
export function DisplayApp() {
  const codeType = useAppStore((s) => s.codeType);
  const stage = useAppStore((s) => s.stage);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const mode = useAppStore((s) => s.mode);
  const lastVizData = useScanStore((s) => s.lastVizData);
  const { setLocale, locale } = useT();

  const postRef = useRef<(m: SyncMessage) => void>(() => {});
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const handleMessage = useCallback((m: SyncMessage) => {
    const app = useAppStore.getState();
    const scan = useScanStore.getState();
    switch (m.type) {
      case 'show':
        scan.setLastVizData(m.viz);
        app.setCodeType(m.viz.kind);
        app.setStage(0);
        app.setAutoPlay(true);
        app.setMode('live');
        break;
      case 'reset':
        scan.setLastVizData(null);
        app.setMode('attract');
        app.setStage(0);
        app.setAutoPlay(true);
        break;
      case 'play':
        app.setAutoPlay(true);
        break;
      case 'pause':
        app.setAutoPlay(false);
        break;
      case 'restart':
        app.setStage(0);
        app.setAutoPlay(true);
        break;
      case 'setStage': {
        const max = STAGES_BY_KIND[app.codeType].length - 1;
        app.setStage(Math.max(0, Math.min(m.stage, max)));
        app.setAutoPlay(true);
        break;
      }
      case 'setCodeType':
        scan.setLastVizData(null);
        app.setMode('attract');
        app.setCodeType(m.kind);
        app.setStage(0);
        app.setAutoPlay(true);
        break;
      case 'setLocale':
        setLocale(m.locale);
        break;
      case 'requestState':
        postRef.current({ type: 'state', state: buildState() });
        break;
      // 'animationComplete' / 'state' are display->scan; never received here.
    }
  }, [setLocale]);

  const post = useSyncChannel(handleMessage);
  useEffect(() => {
    postRef.current = post;
  }, [post]);

  // Heartbeat: tell the scan page what's on screen whenever it changes (and
  // once on mount, so an already-open scan page catches up immediately).
  useEffect(() => {
    post({ type: 'state', state: buildState() });
  }, [post, mode, codeType, stage, autoPlay, lastVizData]);

  // Keyboard control also works when the TV/display window is focused (a mirror
  // of the scan page). Actions apply locally; reset + locale are also broadcast
  // so the scan page stays in sync (everything else propagates via heartbeat).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const onButton = tag === 'BUTTON' || tag === 'INPUT';
      const app = useAppStore.getState();

      const digit =
        e.key >= '1' && e.key <= '5'
          ? Number(e.key)
          : /^Numpad[1-5]$/.test(e.code)
            ? Number(e.code.slice(6))
            : 0;
      if (digit) {
        e.preventDefault();
        handleMessage({ type: 'setStage', stage: digit - 1 });
        return;
      }

      const cycle = (dir: number) => {
        const i = ATTRACT_ORDER.indexOf(app.codeType);
        const next = (i + dir + ATTRACT_ORDER.length) % ATTRACT_ORDER.length;
        handleMessage({ type: 'setCodeType', kind: ATTRACT_ORDER[next] });
      };

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          cycle(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          cycle(-1);
          break;
        case ' ':
          if (onButton) break;
          e.preventDefault();
          handleMessage({ type: app.autoPlay ? 'pause' : 'play' });
          break;
        case 'r':
        case 'R':
        case 'Escape':
          e.preventDefault();
          handleMessage({ type: 'reset' });
          post({ type: 'reset' });
          break;
        case 'Enter':
          if (onButton) break;
          e.preventDefault();
          handleMessage({ type: 'reset' });
          post({ type: 'reset' });
          break;
        case 'l':
        case 'L': {
          e.preventDefault();
          const next = localeRef.current === 'en' ? 'nl' : 'en';
          setLocale(next);
          post({ type: 'setLocale', locale: next });
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMessage, post, setLocale]);

  // Last stage finished: attract advances to the next code type; live notifies
  // the scan page and holds on the final frame.
  const handleFinished = useCallback(() => {
    const app = useAppStore.getState();
    if (app.mode === 'attract') {
      const idx = ATTRACT_ORDER.indexOf(app.codeType);
      app.setCodeType(ATTRACT_ORDER[(idx + 1) % ATTRACT_ORDER.length]);
      app.setStage(0);
    } else {
      postRef.current({ type: 'animationComplete' });
    }
  }, []);

  return (
    <div className={`${shell.shell} ${styles.display}`} data-code-type={codeType}>
      <div className={shell.warmGlow} aria-hidden />
      <VisualizerCanvas loop={false} onFinished={handleFinished} />
      <div className={styles.brandSlot}>
        <Brand />
      </div>
      <div className={styles.tabsSlot}>
        <CodeTypeBar
          codeType={codeType}
          onSelect={(kind) => handleMessage({ type: 'setCodeType', kind })}
        />
      </div>
      <InfoCard />
      <ProgressIndicator
        onSelect={(s) => handleMessage({ type: 'setStage', stage: s })}
      />
    </div>
  );
}
