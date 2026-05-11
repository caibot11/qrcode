import { useT } from '@/locales/useT';
import { useAppStore } from '@/stores/useAppStore';
import { useScanStore } from '@/stores/useScanStore';
import { QR_STAGES } from '@/lib/codes/qr/config';
import styles from './InfoCard.module.css';

const FUN_FACTS_QR: Record<number, { en: string; nl: string }> = {
  0: {
    en: 'The three big corner squares are called "finder patterns" — they help a phone find the code even if you hold it sideways!',
    nl: 'De drie grote vierkanten in de hoeken heten "vinderpatronen" — ze helpen een telefoon de code te vinden, ook scheef!',
  },
  1: {
    en: 'The mask is like a puzzle layer. The scanner XORs it off to reveal the real data hiding underneath.',
    nl: 'Het masker is een puzzellaag. De scanner haalt het weg met XOR om de echte data te onthullen.',
  },
  2: {
    en: 'A QR scanner can read about 4,000 characters — that\'s roughly two whole pages of a book!',
    nl: 'Een QR-scanner kan ongeveer 4.000 tekens lezen — dat is ongeveer twee bladzijdes uit een boek!',
  },
  3: {
    en: 'QR codes can be up to 30% damaged or dirty and still work, thanks to Reed-Solomon math from the 1960s.',
    nl: 'QR-codes blijven werken zelfs met 30% schade of vuil, dankzij Reed-Solomon wiskunde uit de jaren \'60.',
  },
  4: {
    en: 'Each 8 little squares spell one letter using ASCII — the same code computers have used since 1963.',
    nl: 'Elke 8 kleine vakjes vormen één letter via ASCII — dezelfde code die computers al gebruiken sinds 1963.',
  },
};

export function InfoCard() {
  const { t, locale } = useT();
  const stage = useAppStore((s) => s.stage);
  const codeType = useAppStore((s) => s.codeType);
  const lastViz = useScanStore((s) => s.lastVizData);

  const stages = codeType === 'qr' ? QR_STAGES : QR_STAGES;
  const cur = stages[stage] ?? stages[0];

  const decoded =
    lastViz?.kind === 'qr' ? lastViz.decodedText : 'HELLO WORLD';

  const fact = FUN_FACTS_QR[stage]?.[locale];

  return (
    <aside className={styles.card} aria-live="polite">
      <div className={styles.stageBadge}>
        Step&nbsp;{stage + 1}&nbsp;of&nbsp;{stages.length}
      </div>

      <h2 className={styles.title}>{t(cur.titleKey)}</h2>

      <div className={styles.hairline} />

      <p className={styles.short}>{t(cur.shortKey)}</p>

      <div className={styles.spacer} />

      {fact && (
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
            <span>{locale === 'nl' ? 'WIST JE DIT?' : 'DID YOU KNOW?'}</span>
          </div>
          <div className={styles.factBody}>{fact}</div>
        </div>
      )}

      <div className={styles.decoded}>
        <div className={styles.decodedLabel}>
          {locale === 'nl' ? 'Gedecodeerd' : 'Decoded'}
        </div>
        <div className={styles.decodedValue}>{decoded}</div>
      </div>
    </aside>
  );
}
