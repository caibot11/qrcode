import type { StageConfig } from '../types';

export const QR_STAGES: readonly StageConfig[] = [
  {
    titleKey: 'stage.qr.0.title',
    labelKey: 'stage.qr.0.label',
    bodyKey: 'stage.qr.0.short',
    duration: 10000,
  },
  {
    titleKey: 'stage.qr.1.title',
    labelKey: 'stage.qr.1.label',
    bodyKey: 'stage.qr.1.short',
    duration: 12000,
  },
  {
    titleKey: 'stage.qr.2.title',
    labelKey: 'stage.qr.2.label',
    bodyKey: 'stage.qr.2.short',
    duration: 18000,
  },
  {
    titleKey: 'stage.qr.3.title',
    labelKey: 'stage.qr.3.label',
    bodyKey: 'stage.qr.3.short',
    duration: 10000,
  },
  {
    titleKey: 'stage.qr.4.title',
    labelKey: 'stage.qr.4.label',
    bodyKey: 'stage.qr.4.short',
    duration: 15000,
  },
];

export const QR_STAGE_COUNT = QR_STAGES.length;
