import { colors, fonts } from '@cheapa/config/tokens';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

/**
 * Type scale (DESIGN.md §1 Typography). Each variant fixes family, size, line height and
 * tracking; colour and layout come from className/style. One font family per weight, so
 * Android renders the right weight (fontWeight alone doesn't pick custom-font weights).
 */
const VARIANTS = {
  displayXL: { fontFamily: fonts.display, fontSize: 44, lineHeight: 45, letterSpacing: -1.5 },
  displayL: { fontFamily: fonts.display, fontSize: 34, lineHeight: 36, letterSpacing: -1 },
  displayM: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, letterSpacing: -0.6 },
  displayS: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.displayBold, fontSize: 19, lineHeight: 23 },
  priceL: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.8 },
  priceXL: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  priceM: { fontFamily: fonts.display, fontSize: 18, lineHeight: 22, letterSpacing: -0.3 },
  priceS: { fontFamily: fonts.display, fontSize: 16, lineHeight: 20 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.sansSemibold, fontSize: 15, lineHeight: 20 },
  button: { fontFamily: fonts.sansSemibold, fontSize: 16, lineHeight: 20 },
  small: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  smallRegular: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.sansMedium, fontSize: 11, lineHeight: 14 },
  pill: { fontFamily: fonts.sansSemibold, fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14 },
  monoLabel: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 13, letterSpacing: 1 },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /** Overrides the variant's size (and scales its line height). */
  size?: number;
  className?: string;
}

export function Text({ variant = 'body', size, style, ...rest }: TextProps) {
  const base: TextStyle = VARIANTS[variant];
  const sized: TextStyle | undefined =
    size && base.fontSize && base.lineHeight
      ? { fontSize: size, lineHeight: Math.round((base.lineHeight / base.fontSize) * size) }
      : undefined;
  return <RNText style={[{ color: colors.ink }, base, sized, style]} {...rest} />;
}
