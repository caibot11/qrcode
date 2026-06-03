import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { STAGES_BY_KIND } from '@/lib/codes/registry';
import styles from './StageBar.module.css';

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

interface Props {
  /** When provided, chips are clickable and jump to that stage. */
  onSelect?: (stage: number) => void;
}

/**
 * Step indicator for the TV display — the same chips as the old StageBar.
 * Clickable when `onSelect` is given (jump to stage), else read-only.
 */
export function ProgressIndicator({ onSelect }: Props) {
  const { t } = useT();
  const stage = useAppStore((s) => s.stage);
  const codeType = useAppStore((s) => s.codeType);
  const stages = STAGES_BY_KIND[codeType];

  return (
    <div className={styles.bar}>
      <div className={styles.chips}>
        {stages.map((s, i) => {
          const state =
            i < stage ? 'done' : i === stage ? 'active' : 'upcoming';
          const inner = (
            <>
              <span className={styles.chipNum}>
                {state === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <span className={styles.chipText}>
                <span className={styles.chipLabel}>{t(s.labelKey)}</span>
                <span className={styles.chipMeta}>
                  {state === 'done'
                    ? t('progress.done')
                    : t('progress.step').replace('{n}', String(i + 1))}
                </span>
              </span>
            </>
          );
          const cls = `${styles.chip} ${styles[`chip_${state}`]}`;
          return onSelect ? (
            <button
              key={s.titleKey}
              type="button"
              className={cls}
              onClick={() => onSelect(i)}
            >
              {inner}
            </button>
          ) : (
            <div key={s.titleKey} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
