import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { STAGES_BY_KIND } from '@/lib/codes/registry';
import { DEMO_QR } from '@/lib/codes/qr/demo';
import { DEMO_DM } from '@/lib/codes/datamatrix/demo';
import { DEMO_AZTEC } from '@/lib/codes/aztec/demo';
import { DEMO_BARCODE } from '@/lib/codes/barcode/demo';
import styles from './InfoCard.module.css';

export function InfoCard() {
  const { t } = useT();
  const stage = useAppStore((s) => s.stage);
  const codeType = useAppStore((s) => s.codeType);
  const lastViz = useScanStore((s) => s.lastVizData);

  const stages = STAGES_BY_KIND[codeType];
  const cur = stages[stage] ?? stages[0];

  // Decoded text: from live scan if matching kind, else demo text per code type.
  let decoded: string;
  if (lastViz?.kind === codeType) {
    decoded = lastViz.decodedText;
  } else {
    decoded =
      codeType === 'qr'
        ? DEMO_QR.decodedText
        : codeType === 'datamatrix'
          ? DEMO_DM.decodedText
          : codeType === 'aztec'
            ? DEMO_AZTEC.decodedText
            : DEMO_BARCODE.decodedText;
  }

  // Fun fact for this stage, per code type.
  const factKey = `fact.${codeType}.${stage}`;
  const fact = t(factKey);
  const hasFact = fact !== factKey;

  return (
    <aside className={styles.card} aria-live="polite">
      <div className={styles.stageBadge}>
        {t('infoCard.stepOf')
          .replace('{n}', String(stage + 1))
          .replace('{m}', String(stages.length))}
      </div>

      <h2 className={styles.title}>{t(cur.titleKey)}</h2>

      <div className={styles.hairline} />

      <p className={styles.short}>{t(cur.bodyKey)}</p>

      <div className={styles.spacer} />

      {hasFact && (
        <div className={styles.factCard}>
          <div className={styles.factHeader}>
            <span className={styles.factBulb} aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.7.7 1 1.6 1 2.5V18h6v-.8c0-.9.3-1.8 1-2.5A7 7 0 0 0 12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>{t('didYouKnow')}</span>
          </div>
          <div className={styles.factBody}>{fact}</div>
        </div>
      )}

      <div className={styles.decoded}>
        <div className={styles.decodedLabel}>{t('decoded')}</div>
        <div className={styles.decodedValue}>{decoded}</div>
      </div>
    </aside>
  );
}
