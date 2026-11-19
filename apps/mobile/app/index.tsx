import { colors } from '@cheapa/config/tokens';
import { router } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, LogoMark, Text } from '../components';

/**
 * Placeholder until the Home screen (Home.dc.html) lands in 6.1. Not a designed screen:
 * it only points developers at the component gallery.
 */
export default function Index() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: 'center', gap: 16 }}>
        <LogoMark size={56} />
        <Text variant="displayL">Wetin you wan buy? Snap am.</Text>
        {__DEV__ ? (
          <Button
            label="Component gallery"
            variant="outline"
            onPress={() => router.push('/dev/components')}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
