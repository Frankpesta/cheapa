import { colors } from '@cheapa/config/tokens';
import type { LucideIcon } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { View } from 'react-native';

/** DESIGN.md §1 Iconography: 22 px line icons, stroke 1.8, round caps (Lucide's defaults). */
export function Icon({
  as: Glyph,
  size = 22,
  color = colors.ink,
  strokeWidth = 1.8,
}: {
  as: LucideIcon;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} absoluteStrokeWidth={false} />;
}

/** The logo mark: a price tag with a hole, on a lime or ink rounded square. */
export function LogoMark({ size = 40, tone = 'lime' }: { size?: number; tone?: 'lime' | 'ink' }) {
  const bg = tone === 'lime' ? colors.lime : colors.ink;
  const fg = tone === 'lime' ? colors.ink : colors.lime;
  const glyph = Math.round(size * 0.55);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Cheapa"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke={fg}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M3 12V4h8l10 10-8 8z" />
        <Circle cx={7.5} cy={8.5} r={1.2} />
      </Svg>
    </View>
  );
}
