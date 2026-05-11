import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { QR_STAGES } from '@/lib/codes/qr/config';
import styles from './InfoCard.module.css';

export function InfoCard() {
  const { t } = useT();
  const stage = useAppStore((s) => s.stage);
  const codeType = useAppStore((s) => s.codeType);
  const lastViz = useScanStore((s) => s.lastVizData);

  const stages = codeType === 'qr' ? QR_STAGES : QR_STAGES;
  const cur = stages[stage] ?? stages[0];

  const decoded =
    lastViz?.kind === 'qr' ? lastViz.decodedText : 'HELLO WORLD';

  return (
    <aside className={styles.card} aria-live="polite">
      <div className={styles.stageNum}>
        Step {stage + 1} / {stages.length}
      </div>
      <h2 className={styles.title}>{t(cur.titleKey)}</h2>
      <p className={styles.short}>{t(cur.shortKey)}</p>

      <div className={styles.decoded}>
        <div className={styles.decodedLabel}>Decoded</div>
        <div className={styles.decodedValue}>{decoded}</div>
      </div>
    </aside>
  );
}
