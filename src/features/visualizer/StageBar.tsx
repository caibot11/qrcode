import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { STAGES_BY_KIND } from '@/lib/codes/registry';
import styles from './StageBar.module.css';

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

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="m5 12 5 5L20 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function StageBar() {
  const { t, locale } = useT();
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);
  const codeType = useAppStore((s) => s.codeType);
  const setLastVizData = useScanStore((s) => s.setLastVizData);

  const stages = STAGES_BY_KIND[codeType];

  const onScanAgain = () => {
    setLastVizData(null);
    setStage(0);
    setAutoPlay(true);
  };

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.playBtn}
        onClick={() => setAutoPlay(!autoPlay)}
        aria-label={autoPlay ? t('controls.pause') : t('controls.play')}
      >
        {autoPlay ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className={styles.chips}>
        {stages.map((s, i) => {
          const state =
            i < stage ? 'done' : i === stage ? 'active' : 'upcoming';
          return (
            <button
              key={s.titleKey}
              type="button"
              className={`${styles.chip} ${styles[`chip_${state}`]}`}
              onClick={() => setStage(i)}
            >
              <span className={styles.chipNum}>
                {state === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{t(s.labelKey)}</span>
                <span className={styles.chipMeta}>
                  {state === 'done'
                    ? locale === 'nl'
                      ? 'Klaar'
                      : 'Done'
                    : `Step ${i + 1}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className={styles.scanBtn} onClick={onScanAgain}>
        <ResetIcon />
        <span>{t('controls.scanAgain')}</span>
      </button>
    </div>
  );
}
