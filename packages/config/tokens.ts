/**
 * Cheapa design tokens (docs/design/DESIGN.md §1). The single source for colour, type,
 * radius and spacing in apps/mobile (NativeWind theme) and apps/web (Tailwind theme).
 * Add a colour here AND in DESIGN.md, never only one of them (DESIGN.md §5 rule 2).
 */

export const colors = {
  ink: '#0E1A13',
  ground: '#F4F5EF',
  card: '#FFFFFF',
  line: '#E3E6DD',
  lineDashed: '#D5DACF',
  /** Dashed "add" buttons (Watches "Watch something new"). */
  lineStrong: '#B9C1B4',
  /** Progress-bar tracks, chart mid gridline, dividers inside settings groups. */
  track: '#EEF0EA',
  /** Sheet grab handle, unselected radio ring. */
  handle: '#C9CFC4',
  muted: '#55615A',
  /** Inactive tab labels, input placeholders. */
  mutedSoft: '#5E6A62',
  /** Struck-through old prices. */
  strike: '#6B776F',
  body2: '#3A463F',
  lime: '#C6F432',
  green: '#0A7A3A',
  inkSoft: '#1B2B21',
  inkLine: '#2D3D33',
  inkLine2: '#3B4D41',
  onInkMuted: '#C9D2CB',
  /** Mono labels on ink cards ("USED FROM", "% below today"). */
  onInkFaint: '#A9B6AD',
  /** Selected RadioOption background. */
  selected: '#F8FBEE',
  newBg: '#E7F5C2',
  newFg: '#2F4A06',
  usedBg: '#E4ECF7',
  usedFg: '#1E3A66',
  dropBg: '#FFE9DC',
  dropFg: '#9A3412',
  liveBg: '#EEE6F3',
  liveFg: '#4B2A6B',
  premiumBg: '#FFF1C2',
  premiumFg: '#6B4A00',
  scrim: 'rgba(14,26,19,0.55)',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Placeholder tiles and store-initial avatars: background + matching foreground.
 * Pick one stably per name with `tintFor()`.
 */
export const tints = [
  { bg: '#E6EEDB', fg: '#2F4A06' },
  { bg: '#F3E3D3', fg: '#7A4A22' },
  { bg: '#DDE6EE', fg: '#1E3A66' },
  { bg: '#EEE6F3', fg: '#5A3A7A' },
  { bg: '#F3EDD3', fg: '#5C4A0A' },
  { bg: '#FCE7D6', fg: '#7A3A0E' },
  { bg: '#F1E3F3', fg: '#5A2A66' },
] as const;

export type Tint = (typeof tints)[number];

/** Same name, same tint, on every screen and every device. */
export function tintFor(name: string): Tint {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return tints[h % tints.length]!;
}

/** Font family names as registered by expo-font (@expo-google-fonts). One family per weight. */
export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
} as const;

/** DESIGN.md §1 spacing scale. */
export const spacing = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24] as const;

export const radii = {
  pill: 6,
  input: 14,
  row: 16,
  card: 18,
  cardLg: 20,
  hero: 26,
  sheet: 30,
  button: 16,
  buttonLg: 18,
  snap: 20,
} as const;

export const layout = {
  screenX: 20,
  minTouch: 44,
  buttonHeight: 54,
  buttonHeightLg: 56,
  tabBar: 88,
  snapButton: 62,
  snapLift: 26,
} as const;
