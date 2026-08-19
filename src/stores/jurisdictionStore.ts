import { create } from 'zustand';
import type { Jurisdiction } from '../lib/rules/types';

/**
 * The workspace's regulatory jurisdiction.
 *
 * This is chosen once at sign-up and is a property of the workspace, not a
 * view filter — so nothing in the app offers a way to change it. The store
 * exists only to hold the value read off the profile, so the widgets and the
 * compliance engine don't each have to fetch it.
 *
 * `hydrate` is called by AuthContext when the profile loads. If you find
 * yourself wanting a setter here, the change belongs in the workspace's
 * settings and a migration, not in a picker.
 */
interface JurisdictionState {
  selectedJurisdiction: Jurisdiction;
  /** False until the profile has been read, so callers can avoid scanning against a guess. */
  hydrated: boolean;
  hydrate: (jurisdiction: Jurisdiction | null | undefined) => void;
}

export const useJurisdictionStore = create<JurisdictionState>((set) => ({
  selectedJurisdiction: 'nigeria',
  hydrated: false,
  hydrate: (jurisdiction) =>
    set({
      selectedJurisdiction: (jurisdiction as Jurisdiction) || 'nigeria',
      hydrated: true,
    }),
}));
