export interface StageConfig {
  /** i18n key for the kid-friendly title */
  titleKey: string;
  /** i18n key for the short explanation */
  shortKey: string;
  /** stage duration in ms */
  duration: number;
}

export const QR_STAGES: readonly StageConfig[] = [
  { titleKey: 'stage.qr.0.title', shortKey: 'stage.qr.0.short', duration: 10000 },
  { titleKey: 'stage.qr.1.title', shortKey: 'stage.qr.1.short', duration: 12000 },
  { titleKey: 'stage.qr.2.title', shortKey: 'stage.qr.2.short', duration: 18000 },
  { titleKey: 'stage.qr.3.title', shortKey: 'stage.qr.3.short', duration: 10000 },
  { titleKey: 'stage.qr.4.title', shortKey: 'stage.qr.4.short', duration: 15000 },
];

export const QR_STAGE_COUNT = QR_STAGES.length;
