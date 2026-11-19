import { colors } from '@cheapa/config/tokens';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';

/** Filter pill (Results): 38 tall, radius 19, 1.5 dashed-line border; selected = ink. */
export function Chip({
  label,
  count,
  selected = false,
  onPress,
  icon,
  accessibilityLabel,
}: {
  label?: string;
  count?: number;
  selected?: boolean;
  onPress?: () => void;
  /** Icon-only chip (the filter button) when there is no label. */
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  const fg = selected ? colors.card : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={3}
      style={{
        height: 38,
        minWidth: 38,
        borderRadius: 19,
        borderWidth: 1.5,
        borderColor: selected ? colors.ink : colors.lineDashed,
        backgroundColor: selected ? colors.ink : colors.card,
        paddingHorizontal: label ? 14 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {icon ? <Icon as={icon} size={18} color={fg} /> : null}
      {label ? (
        <Text variant="bodyMedium" style={{ fontSize: 14, lineHeight: 18, color: fg }}>
          {label}
        </Text>
      ) : null}
      {count !== undefined ? (
        <Text variant="mono" style={{ fontSize: 12, color: fg, opacity: 0.7 }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Mono pills in a ground track (Product 7D / 30D / 90D). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', gap: 2, backgroundColor: colors.ground, borderRadius: 16, padding: 2 }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            hitSlop={7}
            style={{
              height: 30,
              paddingHorizontal: 12,
              borderRadius: 15,
              justifyContent: 'center',
              backgroundColor: on ? colors.ink : 'transparent',
            }}
          >
            <Text variant="mono" style={{ fontSize: 12, color: on ? colors.card : colors.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Quick-pick tile (WatchSheet −5% / −10% / Any drop): 44 tall, mono; selected = ink + lime. */
export function QuickPick({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        height: 44,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: selected ? colors.ink : colors.lineDashed,
        backgroundColor: selected ? colors.ink : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="mono"
        style={{ fontSize: 14, lineHeight: 18, color: selected ? colors.lime : colors.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
