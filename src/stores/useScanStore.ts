import { create } from 'zustand';
import type { VizData } from '@/lib/codes/types';

export type ScanState = 'idle' | 'scanning' | 'decoded' | 'error';

interface ScanStoreShape {
  scanState: ScanState;
  setScanState: (s: ScanState) => void;

  lastVizData: VizData | null;
  setLastVizData: (d: VizData | null) => void;

  lastError: string | null;
  setLastError: (e: string | null) => void;
}

export const useScanStore = create<ScanStoreShape>((set) => ({
  scanState: 'idle',
  setScanState: (scanState) => set({ scanState }),

  lastVizData: null,
  setLastVizData: (lastVizData) => set({ lastVizData }),

  lastError: null,
  setLastError: (lastError) => set({ lastError }),
}));
