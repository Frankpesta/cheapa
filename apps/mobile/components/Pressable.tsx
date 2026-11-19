import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/** Buttons scale to 0.98 while pressed (DESIGN.md §2 Motion). */
export function PressableScale({
  style,
  disabled,
  ...rest
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; className?: string }) {
  return (
    <RNPressable
      disabled={disabled}
      style={({ pressed }) => [style, pressed && !disabled ? { transform: [{ scale: 0.98 }] } : null]}
      {...rest}
    />
  );
}
