import { colors } from '@cheapa/config/tokens';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text } from './Text';

/** 48×28 track, 22 knob; on = ink, off = lineDashed (WatchSheet, Profile). */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  accessibilityLabel: string;
}) {
  const reduced = useReducedMotion();
  const x = useSharedValue(value ? 20 : 0);
  useEffect(() => {
    x.value = reduced ? (value ? 20 : 0) : withTiming(value ? 20 : 0, { duration: 160 });
  }, [value, reduced, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        padding: 3,
        backgroundColor: value ? colors.ink : colors.lineDashed,
      }}
    >
      <Animated.View
        style={[
          {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.card,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          },
          knob,
        ]}
      />
    </Pressable>
  );
}

/**
 * Full-width option card (Confirm): radio, title + subtitle, optional "FROM" price.
 * Selected = 2 px ink border on `selected`.
 */
export function RadioOption({
  title,
  subtitle,
  price,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  /** Formatted already ("₦318,500"). */
  price?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        // Keep the box size constant when the border thickens.
        padding: selected ? 13.5 : 14,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1.5,
        borderColor: selected ? colors.ink : colors.line,
        backgroundColor: selected ? colors.selected : colors.card,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? colors.ink : colors.handle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink }} />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="label" style={{ fontSize: 16 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="smallRegular" style={{ color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {price ? (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="mono" style={{ fontSize: 10, color: colors.muted }}>
            FROM
          </Text>
          <Text variant="priceM">{price}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
