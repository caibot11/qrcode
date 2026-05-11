import { create } from 'zustand';

interface UiState {
  showGlossary: boolean;
  setShowGlossary: (b: boolean) => void;

  showCompare: boolean;
  setShowCompare: (b: boolean) => void;

  showSampleMenu: boolean;
  setShowSampleMenu: (b: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  showGlossary: false,
  setShowGlossary: (showGlossary) => set({ showGlossary }),

  showCompare: false,
  setShowCompare: (showCompare) => set({ showCompare }),

  showSampleMenu: false,
  setShowSampleMenu: (showSampleMenu) => set({ showSampleMenu }),
}));
