import { Redirect, router, Tabs } from 'expo-router';
import { TabBar, type TabKey } from '../../components';
import { usePrefs } from '../../lib/prefs';

const ROUTE_TAB: Record<string, TabKey> = {
  index: 'home',
  watches: 'watches',
  history: 'history',
  settings: 'me',
};
const TAB_ROUTE = { home: '/', watches: '/watches', history: '/history', me: '/settings' } as const;

/** Home · Watches · [Snap] · History · Me (DESIGN.md §3). First launch goes to onboarding. */
export default function TabsLayout() {
  const { onboarded } = usePrefs();
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state }) => (
        <TabBar
          active={ROUTE_TAB[state.routes[state.index]?.name ?? 'index'] ?? 'home'}
          onNavigate={(tab) => router.navigate(TAB_ROUTE[tab])}
          onSnap={() => router.push('/camera')}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="watches" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
