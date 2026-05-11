import { useT } from '@/locales/useT';
import styles from './LangToggle.module.css';

export function LangToggle() {
  const { locale, setLocale } = useT();

  return (
    <div className={styles.toggle} role="group" aria-label="Language">
      <button
        type="button"
        className={`${styles.btn} ${locale === 'en' ? styles.active : ''}`}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`${styles.btn} ${locale === 'nl' ? styles.active : ''}`}
        onClick={() => setLocale('nl')}
      >
        NL
      </button>
    </div>
  );
}
