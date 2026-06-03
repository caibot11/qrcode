import { create } from 'zustand';
import type { CodeKind } from '@/lib/codes/types';

/** Display playback mode: idle attract loop vs. a live scanned code. */
export type DisplayMode = 'attract' | 'live';

interface AppState {
  codeType: CodeKind;
  setCodeType: (k: CodeKind) => void;

  stage: number;
  setStage: (s: number) => void;

  autoPlay: boolean;
  setAutoPlay: (b: boolean) => void;

  mode: DisplayMode;
  setMode: (m: DisplayMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  codeType: 'qr',
  setCodeType: (codeType) => set({ codeType }),

  stage: 0,
  setStage: (stage) => set({ stage }),

  autoPlay: true,
  setAutoPlay: (autoPlay) => set({ autoPlay }),

  mode: 'attract',
  setMode: (mode) => set({ mode }),
}));
