import { Html } from '@react-three/drei';
import styles from './StageLabels.module.css';

export interface LabelSpec {
  id: string;
  text: string;
  position: [number, number, number];
  variant?:
    | 'default'
    | 'bit'
    | 'char'
    | 'decoded'
    | 'data'
    | 'ec'
    | 'warn'
    | 'success'
    | 'pill'
    | 'decoding';
  /** 0..1, default 1. Lets per-frame label fades skip mount/unmount churn. */
  opacity?: number;
}

interface Props {
  labels: LabelSpec[];
}

const VARIANT_CLASS: Record<NonNullable<LabelSpec['variant']>, string> = {
  default: styles.label,
  bit: `${styles.label} ${styles.bit}`,
  char: `${styles.label} ${styles.char}`,
  decoded: `${styles.label} ${styles.decoded}`,
  data: `${styles.label} ${styles.data}`,
  ec: `${styles.label} ${styles.ec}`,
  warn: `${styles.label} ${styles.warn}`,
  success: `${styles.label} ${styles.success}`,
  pill: `${styles.label} ${styles.pill}`,
  decoding: `${styles.label} ${styles.decoding}`,
};

export function StageLabels({ labels }: Props) {
  return (
    <>
      {labels.map((l) => (
        <Html
          key={l.id}
          position={l.position}
          center
          zIndexRange={[40, 0]}
          pointerEvents="none"
        >
          <div
            className={VARIANT_CLASS[l.variant ?? 'default']}
            style={l.opacity !== undefined ? { opacity: l.opacity } : undefined}
          >
            {l.text}
          </div>
        </Html>
      ))}
    </>
  );
}
