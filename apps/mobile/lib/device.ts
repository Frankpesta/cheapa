/**
 * Anonymous device id (06 §6.5, 08 §8.3): a random UUID kept in SecureStore and sent as
 * X-Cheapa-Device on every API call. Signed-out search and history hang off it.
 */
import * as Crypto from 'expo-crypto';
import { getItem, setItem } from './storage';

const KEY = 'cheapa.device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pending: Promise<string> | null = null;

export function deviceId(): Promise<string> {
  pending ??= (async () => {
    const saved = await getItem(KEY);
    if (saved && UUID.test(saved)) return saved;
    const id = Crypto.randomUUID();
    await setItem(KEY, id);
    return id;
  })();
  return pending;
}
