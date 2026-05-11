import { TopBar } from '@/components/TopBar';
import { VisualizerCanvas } from '@/features/visualizer/VisualizerCanvas';
import { InfoCard } from '@/features/visualizer/InfoCard';
import { StageBar } from '@/features/visualizer/StageBar';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <VisualizerCanvas />
      <TopBar />
      <InfoCard />
      <StageBar />
    </div>
  );
}
