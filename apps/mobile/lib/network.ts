/**
 * Online state (06 §6.4). expo-network feeds TanStack's onlineManager, so while offline
 * every query (searches included) pauses instead of failing, and resumes by itself when the
 * connection returns: that is the "queued search". `useOnline` drives the offline banner.
 */
import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** No connection, or the OS says the internet is unreachable (captive portal, no data). */
export const isOnline = (s: { isConnected?: boolean; isInternetReachable?: boolean }) =>
  s.isConnected !== false && s.isInternetReachable !== false;

let wired = false;

export function wireOnlineManager(): void {
  if (wired || Platform.OS === 'web') return; // The browser's own online events already work.
  wired = true;
  onlineManager.setEventListener((setOnline) => {
    void Network.getNetworkStateAsync()
      .then((s) => setOnline(isOnline(s)))
      .catch(() => undefined);
    const sub = Network.addNetworkStateListener((s) => setOnline(isOnline(s)));
    return () => sub.remove();
  });
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
