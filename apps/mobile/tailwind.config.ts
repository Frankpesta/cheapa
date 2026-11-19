import { colors, fonts, radii, tints } from '@cheapa/config/tokens';
import type { Config } from 'tailwindcss';
// @ts-expect-error nativewind 4.2 ships an empty preset .d.ts (not a module).
import nativewind from 'nativewind/preset';

/** Theme = DESIGN.md tokens only; no Tailwind default colours or fonts leak in. */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [nativewind],
  // Light only (app.json userInterfaceStyle). 'media' makes NativeWind throw on web.
  darkMode: 'class',
  theme: {
    colors: {
      transparent: 'transparent',
      ...colors,
      ...Object.fromEntries(
        tints.flatMap((t, i) => [
          [`tint${i}`, t.bg],
          [`tint${i}-fg`, t.fg],
        ]),
      ),
    },
    fontFamily: {
      display: [fonts.display],
      'display-bold': [fonts.displayBold],
      sans: [fonts.sans],
      'sans-medium': [fonts.sansMedium],
      'sans-semibold': [fonts.sansSemibold],
      'sans-bold': [fonts.sansBold],
      mono: [fonts.mono],
    },
    extend: {
      borderRadius: Object.fromEntries(Object.entries(radii).map(([k, v]) => [k, `${v}px`])),
    },
  },
} satisfies Config;
