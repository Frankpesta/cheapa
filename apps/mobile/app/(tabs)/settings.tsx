import { colors } from '@cheapa/config/tokens';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { User } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, SettingsGroup, SettingsItem, Text, Toggle } from '../../components';
import { setPrefs, usePrefs } from '../../lib/prefs';

const SITE = 'https://cheapa.ng';

/**
 * Profile.dc.html, signed-out (accounts arrive with 6.5). Left out until their backends
 * exist: the Premium card (10-monetization, price not set), Notifications (8.6–8.7),
 * "Stores we check" (no stores endpoint) and Sign out.
 */
export default function Settings() {
  const prefs = usePrefs();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon as={User} size={26} color={colors.lime} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="displayS" accessibilityRole="header">
              Guest
            </Text>
            <Text variant="smallRegular" style={{ color: colors.muted }}>
              Not signed in · Free plan
            </Text>
          </View>
        </View>

        <SettingsGroup>
          <SettingsItem
            label="Show new items only"
            accessory={
              <Toggle
                value={prefs.newOnly}
                onChange={(newOnly) => setPrefs({ newOnly })}
                accessibilityLabel="Show new items only"
              />
            }
          />
          <SettingsItem
            label="Data saver"
            accessory={
              <Toggle
                value={prefs.dataSaver}
                onChange={(dataSaver) => setPrefs({ dataSaver })}
                accessibilityLabel="Data saver"
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsItem
            label="Privacy and my data"
            chevron
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/privacy`)}
          />
          <SettingsItem
            label="How Cheapa makes money"
            chevron
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE}/how-we-make-money`)}
          />
        </SettingsGroup>

        <Text variant="mono" style={{ color: colors.muted, textAlign: 'center', marginTop: 8 }}>
          CHEAPA {version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
