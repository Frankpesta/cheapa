import { colors, fonts } from '@cheapa/config/tokens';
import { Bell, Camera, Clock, House, User, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export type TabKey = 'home' | 'watches' | 'history' | 'me';

const TABS: Record<TabKey, { label: string; icon: LucideIcon }> = {
  home: { label: 'Home', icon: House },
  watches: { label: 'Watches', icon: Bell },
  history: { label: 'History', icon: Clock },
  me: { label: 'Me', icon: User },
};

/**
 * Home · Watches · [Snap] · History · Me. White, 88 tall including the bottom inset,
 * top border `line`; Snap is a 62 lime square raised 26 with a 5 px ground ring.
 */
export function TabBar({
  active,
  onNavigate,
  onSnap,
}: {
  active: TabKey;
  onNavigate: (tab: TabKey) => void;
  onSnap: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tab = (key: TabKey) => (
    <Tab key={key} tabKey={key} active={active === key} onPress={() => onNavigate(key)} />
  );
  return (
    <View
      accessibilityRole="tablist"
      style={{
        minHeight: 88,
        paddingTop: 8,
        paddingHorizontal: 8,
        paddingBottom: insets.bottom,
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-start',
      }}
    >
      {tab('home')}
      {tab('watches')}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Snap a product"
        onPress={onSnap}
        style={{
          width: 62,
          height: 62,
          marginTop: -26,
          borderRadius: 20,
          backgroundColor: colors.lime,
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 0 5px ${colors.ground}, 0 10px 24px rgba(14,26,19,0.25)`,
        }}
      >
        <Icon as={Camera} size={28} strokeWidth={2} />
      </PressableScale>
      {tab('history')}
      {tab('me')}
    </View>
  );
}

function Tab({ tabKey, active, onPress }: { tabKey: TabKey; active: boolean; onPress: () => void }) {
  const { label, icon } = TABS[tabKey];
  const color = active ? colors.ink : colors.mutedSoft;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 60, minHeight: 44, paddingTop: 4, alignItems: 'center', gap: 4 }}
    >
      <Icon as={icon} color={color} />
      <Text variant="caption" style={{ color, fontFamily: active ? fonts.sansSemibold : fonts.sansMedium }}>
        {label}
      </Text>
    </Pressable>
  );
}
