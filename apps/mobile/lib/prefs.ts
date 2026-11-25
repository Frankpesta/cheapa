/**
 * Local preferences (Profile toggles) and the onboarding flag. Small, so they load once at
 * start-up and live in a tiny external store that screens subscribe to.
 */
import { useSyncExternalStore } from 'react';
import { getItem, setItem } from './storage';

export interface Prefs {
  onboarded: boolean;
  /** Results open on the "New" filter. */
  newOnly: boolean;
  /** Smaller uploads (lib/image.ts). */
  dataSaver: boolean;
}

const KEY = 'cheapa.prefs';
const DEFAULTS: Prefs = { onboarded: false, newOnly: false, dataSaver: false };

let state: Prefs = DEFAULTS;
const listeners = new Set<() => void>();

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    state = DEFAULTS;
  }
  return state;
}

export function setPrefs(patch: Partial<Prefs>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  void setItem(KEY, JSON.stringify(state));
}

export const getPrefs = () => state;

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
