import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { QR_STAGES } from '@/lib/codes/qr/config';
import styles from './StageBar.module.css';

export function StageBar() {
  const { t } = useT();
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const autoPlay = useAppStore((s) => s.autoPlay);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);

  const stages = QR_STAGES;
  const canPrev = stage > 0;
  const canNext = stage < stages.length - 1;

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => canPrev && setStage(stage - 1)}
        disabled={!canPrev}
        aria-label={t('controls.prev')}
        title={t('controls.prev')}
      >
        ‹
      </button>

      <div className={styles.chips}>
        {stages.map((s, i) => (
          <button
            key={s.titleKey}
            type="button"
            className={`${styles.chip} ${i === stage ? styles.chipActive : ''}`}
            onClick={() => setStage(i)}
            aria-label={t(s.titleKey)}
          >
            <span className={styles.chipNum}>{i + 1}</span>
            <span className={styles.chipLabel}>{t(s.titleKey)}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => canNext && setStage(stage + 1)}
        disabled={!canNext}
        aria-label={t('controls.next')}
        title={t('controls.next')}
      >
        ›
      </button>

      <button
        type="button"
        className={`${styles.playBtn} ${autoPlay ? styles.playBtnOn : ''}`}
        onClick={() => setAutoPlay(!autoPlay)}
        aria-label={autoPlay ? t('controls.pause') : t('controls.play')}
      >
        {autoPlay ? t('controls.pause') : t('controls.play')}
      </button>
    </div>
  );
}
