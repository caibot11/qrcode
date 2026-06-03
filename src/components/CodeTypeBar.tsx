import { useT } from '@/locales/useT';
import type { CodeKind } from '@/lib/codes/types';
import styles from './TopBar.module.css';

const CODE_TYPES: CodeKind[] = ['qr', 'barcode', 'datamatrix', 'aztec'];

interface Props {
  /** Currently active code type (highlighted). */
  codeType: CodeKind;
  /** When provided, tabs are clickable (laptop). When omitted, read-only (TV). */
  onSelect?: (k: CodeKind) => void;
}

/**
 * The QR / Barcode / Data Matrix / Aztec selector. Interactive on the scan page
 * (drives the TV); read-only on the TV (just shows what's playing).
 */
export function CodeTypeBar({ codeType, onSelect }: Props) {
  const { t } = useT();

  return (
    <nav className={styles.codeTypes} aria-label="Code type">
      {CODE_TYPES.map((k) => {
        const cls = `${styles.codeBtn} ${codeType === k ? styles.codeBtnActive : ''}`;
        return onSelect ? (
          <button
            key={k}
            type="button"
            className={cls}
            onClick={() => onSelect(k)}
          >
            {t(`codeType.${k}`)}
          </button>
        ) : (
          <span key={k} className={cls} aria-current={codeType === k}>
            {t(`codeType.${k}`)}
          </span>
        );
      })}
    </nav>
  );
}
