import { colors } from '@cheapa/config/tokens';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './Button';
import { Text } from './Text';

/**
 * Sheet over a scrim (Confirm, WatchSheet): ground surface, radius 30 top, 40×5 grab
 * handle, mono eyebrow + Display title, close button top-right. Slides up 250 ms ease-out.
 */
export function BottomSheet({
  visible,
  onClose,
  eyebrow,
  title,
  children,
  fill = false,
}: {
  visible: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  /** Tall sheets (WatchSheet) reach from y=130 to the bottom. */
  fill?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const sheet: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    ...(fill ? { top: 130 } : {}),
    backgroundColor: colors.ground,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Math.max(34, insets.bottom + 12),
  };
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        entering={reduced ? undefined : FadeIn.duration(200)}
        exiting={reduced ? undefined : FadeOut.duration(150)}
        style={{ flex: 1 }}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: colors.scrim }}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={title}
        entering={reduced ? undefined : SlideInDown.duration(250).easing(Easing.out(Easing.cubic))}
        exiting={reduced ? undefined : SlideOutDown.duration(200)}
        style={sheet}
      >
        <View
          style={{
            width: 40,
            height: 5,
            borderRadius: 3,
            backgroundColor: colors.handle,
            alignSelf: 'center',
            marginBottom: 18,
          }}
        />
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            {eyebrow ? (
              <Text variant="mono" style={{ letterSpacing: 1, color: colors.muted }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text variant="displayM" accessibilityRole="header">
              {title}
            </Text>
          </View>
          <IconButton icon={X} label="Close" tone="soft" onPress={onClose} />
        </View>
        {children}
      </Animated.View>
    </Modal>
  );
}
