import { useT } from '@/locales/useT';
import styles from './TopBar.module.css';

/** App brand mark + title. Shown on both pages. */
export function Brand() {
  const { t } = useT();
  return (
    <div className={styles.brand}>
      <div className={styles.brandMark} aria-hidden>
        <div className={styles.brandMarkInner} />
      </div>
      <div className={styles.brandText}>
        <span className={styles.brandTitle}>{t('app.title')}</span>
        <span className={styles.brandSub}>{t('app.subtitle')}</span>
      </div>
    </div>
  );
}
