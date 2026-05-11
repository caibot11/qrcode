import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import type { CodeKind } from '@/lib/codes/types';
import { LangToggle } from './LangToggle';
import styles from './TopBar.module.css';

const CODE_TYPES: CodeKind[] = ['qr', 'barcode', 'datamatrix', 'aztec'];

export function TopBar() {
  const { t } = useT();
  const codeType = useAppStore((s) => s.codeType);
  const setCodeType = useAppStore((s) => s.setCodeType);
  const setStage = useAppStore((s) => s.setStage);
  const setAutoPlay = useAppStore((s) => s.setAutoPlay);

  const onPickCodeType = (k: CodeKind) => {
    if (k === codeType) return;
    setCodeType(k);
    setStage(0);
    setAutoPlay(true);
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <div className={styles.brandMark} aria-hidden>
          <div className={styles.brandMarkInner} />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandTitle}>{t('app.title')}</span>
          <span className={styles.brandSub}>{t('app.subtitle')}</span>
        </div>
      </div>

      <nav className={styles.codeTypes} aria-label="Code type">
        {CODE_TYPES.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.codeBtn} ${codeType === k ? styles.codeBtnActive : ''}`}
            onClick={() => onPickCodeType(k)}
          >
            {t(`codeType.${k}`)}
          </button>
        ))}
      </nav>

      <div className={styles.actions}>
        <LangToggle />
        <div className={styles.cameraPill} role="status">
          <span className={styles.cameraDot} aria-hidden />
          LIVE
        </div>
      </div>
    </header>
  );
}
