/**
 * Small key/value store: SecureStore on the phone, localStorage on Expo web (dev only;
 * SecureStore has no web build). Keys must match /^[\w.-]+$/.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  if (web) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the value lives for this session only.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
