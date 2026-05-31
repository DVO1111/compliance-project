import { create } from 'zustand';
import type { Jurisdiction } from '../lib/rules/types';

interface JurisdictionState {
  selectedJurisdiction: Jurisdiction;
  setJurisdiction: (jurisdiction: Jurisdiction) => void;
}

export const useJurisdictionStore = create<JurisdictionState>((set) => ({
  selectedJurisdiction: 'nigeria',
  setJurisdiction: (jurisdiction) => set({ selectedJurisdiction: jurisdiction }),
}));
