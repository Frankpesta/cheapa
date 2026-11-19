import { colors } from '@cheapa/config/tokens';
import { ArrowLeft } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconButton, Text } from '../../components';
import { QueryField } from '../QueryField';

/**
 * NotFound.dc.html: the empty state. The "Where did you see it?" field and the notify-me
 * card need a discovery endpoint that doesn't exist yet (BACKLOG), so they are left out
 * rather than shown as controls that do nothing.
 */
export function NotFound({
  initialQuery,
  title = 'We no find am… yet.',
  body = "This item isn't in the stores we check, or the photo was hard to read. Tell us what it is and we'll search by name.",
  onBack,
  onSearch,
}: {
  initialQuery?: string;
  title?: string;
  body?: string;
  onBack: () => void;
  onSearch: (query: string) => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 24, paddingBottom: 36 }}
        >
          <View style={{ marginLeft: -10 }}>
            <IconButton icon={ArrowLeft} label="Back" onPress={onBack} />
          </View>
          <Magnifier />
          <Text variant="displayL" accessibilityRole="header" style={{ marginTop: 14 }}>
            {title}
          </Text>
          <Text variant="body" style={{ marginTop: 10, color: colors.body2 }}>
            {body}
          </Text>
          <Text variant="label" style={{ marginTop: 22, fontSize: 13 }}>
            What is it?
          </Text>
          <View style={{ marginTop: 8 }}>
            <QueryField initial={initialQuery ?? ''} onSubmit={onSearch} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Dashed "?" card with a magnifier over it. */
function Magnifier() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: 210, marginTop: 6, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 120,
          height: 150,
          borderRadius: 26,
          borderWidth: 2.5,
          borderStyle: 'dashed',
          borderColor: colors.lineStrong,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="displayXL" style={{ fontSize: 64, lineHeight: 70, color: colors.lineStrong }}>
          ?
        </Text>
      </View>
      <View style={{ position: 'absolute', left: '50%', top: 104, marginLeft: 21, width: 78, height: 78 }}>
        <View
          style={{
            width: 78,
            height: 78,
            borderRadius: 39,
            borderWidth: 7,
            borderColor: colors.ink,
            backgroundColor: colors.limeGlass,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 62,
            top: 68,
            width: 46,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.ink,
            transform: [{ rotate: '45deg' }],
            transformOrigin: 'left center',
          }}
        />
      </View>
    </View>
  );
}
