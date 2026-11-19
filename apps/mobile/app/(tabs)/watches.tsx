import { colors } from '@cheapa/config/tokens';
import { Bell } from 'lucide-react-native';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '../../components';

/**
 * Watches tab. Price watches and alerts are Phase 2 (08 §8.6–8.8), so Watches.dc.html isn't
 * built yet; this holding state is composed from existing type and the NotFound notify
 * card. Flagged for design review.
 */
export default function Watches() {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 14 }}>
        <Text variant="displayL" accessibilityRole="header">
          Watches
        </Text>
        <View
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 18,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.newBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon as={Bell} color={colors.newFg} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">Price watches are coming</Text>
            <Text variant="smallRegular" style={{ color: colors.muted }}>
              Soon you can set a target price and we'll tell you when it drops.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
