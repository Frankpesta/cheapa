import { colors } from '@cheapa/config/tokens';
import { WifiOff } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text } from '../components';
import { useOnline } from '../lib/network';

/**
 * Offline strip over the top of every screen (06 §6.4). No design file: a white card pill
 * with the wifi icon and Geist label, composed from tokens so it reads on both the ground
 * screens and the ink ones (onboarding, camera); flagged for design review. It does
 * not take touches, so the screen under it keeps working with saved results.
 */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  if (online) return null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeInUp.duration(200)}
      exiting={reduced ? undefined : FadeOutUp.duration(150)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, alignItems: 'center' }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 16,
          paddingVertical: 8,
          paddingHorizontal: 14,
        }}
      >
        <Icon as={WifiOff} size={16} color={colors.ink} />
        <Text variant="small" style={{ color: colors.ink }}>
          No connection. Showing saved results.
        </Text>
      </View>
    </Animated.View>
  );
}
