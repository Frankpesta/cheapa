import { colors } from '@cheapa/config/tokens';
import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { PressableScale } from './Pressable';
import { Text } from './Text';

export type ButtonVariant = 'primary-ink' | 'primary-lime' | 'outline' | 'ghost';

const LOOK: Record<ButtonVariant, { bg: string; fg: string; icon: string; border?: string }> = {
  'primary-ink': { bg: colors.ink, fg: colors.card, icon: colors.lime },
  'primary-lime': { bg: colors.lime, fg: colors.ink, icon: colors.ink },
  outline: { bg: 'transparent', fg: colors.ink, icon: colors.ink, border: colors.ink },
  ghost: { bg: 'transparent', fg: colors.green, icon: colors.green },
};

/**
 * DESIGN.md §2 Button: 54 (or 56 "lg") tall, radius 16 (18 for lg), Geist 16/600.
 * `icon` leads; `trailingArrow` adds the arrow used on "Compare … prices".
 */
export function Button({
  label,
  onPress,
  variant = 'primary-ink',
  size = 'md',
  icon,
  trailingArrow = false,
  trailing,
  disabled,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: LucideIcon;
  trailingArrow?: boolean;
  /** Right-aligned content (the Buy bar's price); spreads the row. */
  trailing?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const look = LOOK[variant];
  const height = variant === 'ghost' ? 48 : size === 'lg' ? 56 : 54;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          height,
          borderRadius: size === 'lg' ? 18 : 16,
          backgroundColor: look.bg,
          borderWidth: look.border ? 1.5 : 0,
          borderColor: look.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: trailing ? 'space-between' : 'center',
          paddingHorizontal: trailing ? 18 : 16,
          gap: 10,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon ? <Icon as={icon} color={look.icon} /> : null}
        <Text variant="button" style={{ color: look.fg, fontSize: variant === 'ghost' ? 15 : 16 }}>
          {label}
        </Text>
        {trailingArrow ? <Icon as={ArrowRight} color={look.icon} /> : null}
      </View>
      {trailing}
    </PressableScale>
  );
}

/**
 * 44 round icon button. `light`: white with a line border (Product header);
 * `soft`: line-grey fill, 40 (sheet close); `camera`: translucent ink.
 */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'plain',
  iconSize,
}: {
  icon: LucideIcon;
  /** Required: icon-only buttons need a label (DESIGN.md §5 rule 3). */
  label: string;
  onPress?: () => void;
  tone?: 'plain' | 'light' | 'soft' | 'camera';
  iconSize?: number;
}) {
  const size = tone === 'soft' ? 40 : 44;
  const look: ViewStyle =
    tone === 'light'
      ? { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line }
      : tone === 'soft'
        ? { backgroundColor: colors.line }
        : tone === 'camera'
          ? { backgroundColor: 'rgba(14,26,19,0.45)' }
          : {};
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={[
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        look,
      ]}
    >
      <Icon
        as={icon}
        size={iconSize ?? (tone === 'soft' ? 18 : 22)}
        color={tone === 'camera' ? colors.card : colors.ink}
      />
    </PressableScale>
  );
}
