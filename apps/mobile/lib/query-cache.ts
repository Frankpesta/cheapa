/**
 * Saved results (06 §6.4): the TanStack cache is written to a file in the app's cache
 * folder (the OS may clear it, which is fine) so results, product pages and history open
 * instantly after a restart and stay readable offline. What is kept: lib/cache-rules.ts.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export { CACHE_MAX_AGE_MS, shouldPersist } from './cache-rules';

/** A new app version may change response shapes: drop the old cache rather than misread it. */
export const cacheBuster = () => Constants.expoConfig?.version ?? 'dev';

const FILE_NAME = 'query-cache.json';

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** Runs a sync step as a promise, turning a throw into a rejection. */
const attempt = <T>(fn: () => T): Promise<T> => {
  try {
    return Promise.resolve(fn());
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
};

/** localStorage on Expo web (dev only). Blocked storage means a session-only cache. */
const webStorage: Storage = {
  getItem: (k) => attempt(() => globalThis.localStorage?.getItem(k) ?? null).catch(() => null),
  setItem: (k, v) => attempt(() => globalThis.localStorage?.setItem(k, v)).catch(() => undefined),
  removeItem: (k) => attempt(() => globalThis.localStorage?.removeItem(k)).catch(() => undefined),
};

/** One file in the cache folder on the phone; the key is fixed. */
const file = () => new File(Paths.cache, FILE_NAME);
const fileStorage: Storage = {
  getItem: () => attempt(file).then((f) => (f.exists ? f.text() : null)),
  setItem: (_k, v) =>
    attempt(() => {
      const f = file();
      if (!f.exists) f.create();
      return f;
    }).then((f) => f.write(v)),
  removeItem: () =>
    attempt(() => {
      const f = file();
      if (f.exists) f.delete();
    }),
};

export const queryPersister = createAsyncStoragePersister({
  storage: Platform.OS === 'web' ? webStorage : fileStorage,
  key: 'cheapa-query-cache',
  // Writes are batched: one file write per second at most while results stream in.
  throttleTime: 1000,
});
