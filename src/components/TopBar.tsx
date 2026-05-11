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

  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <span className={styles.brandTitle}>{t('app.title')}</span>
        <span className={styles.brandSub}>{t('app.subtitle')}</span>
      </div>

      <nav className={styles.codeTypes} aria-label="Code type">
        {CODE_TYPES.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.codeBtn} ${codeType === k ? styles.codeBtnActive : ''}`}
            onClick={() => setCodeType(k)}
            disabled={k !== 'qr'}
            title={k !== 'qr' ? 'Coming soon' : undefined}
          >
            {t(`codeType.${k}`)}
          </button>
        ))}
      </nav>

      <div className={styles.actions}>
        <LangToggle />
      </div>
    </header>
  );
}
