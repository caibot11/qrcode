import { useT } from '@/locales/useT';
import type { CodeKind } from '@/lib/codes/types';
import { LangToggle } from '@/components/LangToggle';
import { CodeTypeBar } from '@/components/CodeTypeBar';
import stageStyles from '@/features/visualizer/StageBar.module.css';
import styles from './ControlBar.module.css';

function PlayIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v13.72L19 12 8 5.14Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  /** Whether the TV animation is currently playing (from the display heartbeat). */
  playing: boolean;
  onPlayPause: () => void;
  onScanAgain: () => void;
  /** Code type currently shown on the TV. */
  codeType: CodeKind;
  onSetCodeType: (k: CodeKind) => void;
}

/**
 * Operator controls on the laptop scan page. Buttons post commands over the
 * sync channel to remote-drive the TV. Reuses the existing StageBar / TopBar
 * button styling.
 */
export function ControlBar({
  playing,
  onPlayPause,
  onScanAgain,
  codeType,
  onSetCodeType,
}: Props) {
  const { t } = useT();

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={stageStyles.playBtn}
        onClick={onPlayPause}
        aria-label={playing ? t('controls.pause') : t('controls.play')}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      <CodeTypeBar codeType={codeType} onSelect={onSetCodeType} />

      <button type="button" className={stageStyles.scanBtn} onClick={onScanAgain}>
        <ResetIcon />
        <span>{t('controls.scanAgain')}</span>
      </button>

      <LangToggle />
    </div>
  );
}
