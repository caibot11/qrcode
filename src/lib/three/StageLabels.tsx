import { Html } from '@react-three/drei';
import styles from './StageLabels.module.css';

export interface LabelSpec {
  id: string;
  text: string;
  position: [number, number, number];
  variant?: 'default' | 'bit' | 'char' | 'decoded' | 'data' | 'ec' | 'warn' | 'success';
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
};

/**
 * 3D-positioned text labels via drei's <Html>. Replaces the legacy
 * CSS2DRenderer label system.
 */
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
          <div className={VARIANT_CLASS[l.variant ?? 'default']}>{l.text}</div>
        </Html>
      ))}
    </>
  );
}
