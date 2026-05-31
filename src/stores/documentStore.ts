import { create } from 'zustand';
import type { ExtractionResult } from '../lib/textExtractor';

interface DocumentEntry {
  id: string;
  extractionResult: ExtractionResult;
  platform: string;
  contentTopic: string;
  targetAudience: string;
  addedAt: string;
}

interface DocumentState {
  documents: DocumentEntry[];
  currentExtraction: ExtractionResult | null;
  isExtracting: boolean;
  extractionProgress: { current: number; total: number } | null;
  extractionError: string | null;

  setExtracting: (isExtracting: boolean) => void;
  setExtractionProgress: (progress: { current: number; total: number } | null) => void;
  setExtractionError: (error: string | null) => void;
  setCurrentExtraction: (result: ExtractionResult | null) => void;
  addDocument: (entry: DocumentEntry) => void;
  removeDocument: (id: string) => void;
  getDocumentText: (id: string) => string | undefined;
  clearAll: () => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentExtraction: null,
  isExtracting: false,
  extractionProgress: null,
  extractionError: null,

  setExtracting: (isExtracting) => set({ isExtracting }),
  setExtractionProgress: (progress) => set({ extractionProgress: progress }),
  setExtractionError: (error) => set({ extractionError: error }),
  setCurrentExtraction: (result) => set({ currentExtraction: result }),

  addDocument: (entry) =>
    set((state) => ({ documents: [...state.documents, entry] })),

  removeDocument: (id) =>
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) })),

  getDocumentText: (id) => {
    const doc = get().documents.find((d) => d.id === id);
    return doc?.extractionResult.rawText;
  },

  clearAll: () =>
    set({
      documents: [],
      currentExtraction: null,
      isExtracting: false,
      extractionProgress: null,
      extractionError: null,
    }),
}));
