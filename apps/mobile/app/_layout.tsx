import '../global.css';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { colors } from '@cheapa/config/tokens';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { ShareIntentProvider } from 'expo-share-intent';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBanner } from '../features/OfflineBanner';
import { ShareHandler } from '../features/share/ShareHandler';
import { wireOnlineManager } from '../lib/network';
import { loadPrefs } from '../lib/prefs';
import { CACHE_MAX_AGE_MS, cacheBuster, queryPersister, shouldPersist } from '../lib/query-cache';

void SplashScreen.preventAutoHideAsync();

/** Registers each weight as its own family; names match `fonts` in @cheapa/config/tokens. */
const FONTS = {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  GeistMono_500Medium,
};

wireOnlineManager();

// gcTime matches the saved cache's age so restored answers aren't dropped before use.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: CACHE_MAX_AGE_MS, retry: 1, refetchOnWindowFocus: false },
  },
});

const persistOptions = {
  persister: queryPersister,
  maxAge: CACHE_MAX_AGE_MS,
  buster: cacheBuster(),
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};

/**
 * The share-intent provider sits outside everything (expo-share-intent asks for that) so a
 * cold start from the share sheet is caught before fonts and prefs finish loading. The
 * native module is missing on web and in Expo Go; the hook then does nothing.
 */
export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ disabled: Platform.OS === 'web', resetOnBackground: true }}>
      <App />
    </ShareIntentProvider>
  );
}

function App() {
  const [loaded, error] = useFonts(FONTS);
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    void loadPrefs().finally(() => setPrefsReady(true));
  }, []);
  const ready = (loaded || error) && prefsReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  // A font that fails to load falls back to the system face rather than blocking the app.
  if (!ready) return null;
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ground }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
            <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="shared" options={{ animation: 'fade' }} />
          </Stack>
          <ShareHandler />
          <OfflineBanner />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}
