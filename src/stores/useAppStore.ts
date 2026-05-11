import { create } from 'zustand';
import type { CodeKind } from '@/lib/codes/types';

interface AppState {
  codeType: CodeKind;
  setCodeType: (k: CodeKind) => void;

  stage: number;
  setStage: (s: number) => void;

  autoPlay: boolean;
  setAutoPlay: (b: boolean) => void;

  isAttract: boolean;
  setAttract: (b: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  codeType: 'qr',
  setCodeType: (codeType) => set({ codeType }),

  stage: 0,
  setStage: (stage) => set({ stage }),

  autoPlay: true,
  setAutoPlay: (autoPlay) => set({ autoPlay }),

  isAttract: false,
  setAttract: (isAttract) => set({ isAttract }),
}));
