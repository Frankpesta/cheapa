import { tintFor } from '@cheapa/config/tokens';
import { Image } from 'expo-image';
import { Package, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Product thumbnail: the store's image when there is one (thumbnails only, ≤ 300 px,
 * DESIGN 6.4), else a tinted placeholder tile with an icon. Tint is stable per `name`.
 */
export function Thumb({
  name,
  uri,
  size,
  radius = 12,
  icon = Package,
  iconSize = 22,
  height = size,
  fill = false,
}: {
  name: string;
  uri?: string | null;
  size: number;
  /** Defaults to `size` (square); Home "Recent" tiles are 108×76. */
  height?: number;
  /** Stretch to the parent's width (lookalike grid); `size` then only sets the icon box. */
  fill?: boolean;
  radius?: number;
  icon?: LucideIcon;
  iconSize?: number;
}) {
  const tint = tintFor(name);
  return (
    <View
      style={{
        width: fill ? '100%' : size,
        height,
        borderRadius: radius,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: fill ? '100%' : size, height }}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon as={icon} size={iconSize} color={tint.fg} />
      )}
    </View>
  );
}

/** Store initials on its tint (ListingRow avatar): "Jiji · Ikeja" → "Ji". */
export function StoreAvatar({ store, size = 40 }: { store: string; size?: number }) {
  const tint = tintFor(store.split('·')[0]!.trim());
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="priceS" style={{ color: tint.fg }}>
        {storeInitials(store)}
      </Text>
    </View>
  );
}

export function storeInitials(store: string): string {
  const name = store.split('·')[0]!.trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  const w = words[0] ?? '?';
  // "3CHUB" -> "3C" (a lone digit says nothing); "Slot" -> "S".
  return (/^\d/.test(w) ? w.slice(0, 2) : w.slice(0, 1)).toUpperCase();
}
