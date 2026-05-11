import { TopBar } from '@/components/TopBar';
import { VisualizerCanvas } from '@/features/visualizer/VisualizerCanvas';
import { InfoCard } from '@/features/visualizer/InfoCard';
import { StageBar } from '@/features/visualizer/StageBar';
import { useAppStore } from '@/stores/useAppStore';
import styles from './AppShell.module.css';

export function AppShell() {
  const codeType = useAppStore((s) => s.codeType);

  return (
    <div className={styles.shell} data-code-type={codeType}>
      <div className={styles.warmGlow} aria-hidden />
      <VisualizerCanvas />
      <TopBar />
      <InfoCard />
      <StageBar />
    </div>
  );
}
