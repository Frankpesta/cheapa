import { colors } from '@cheapa/config/tokens';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { formatNaira, watchProgress } from '../lib/format';
import { PressableScale } from './Pressable';
import { Thumb } from './Thumb';
import { Text } from './Text';

/** Watches card: thumb 52, title/meta, price + change, 8 tall progress start -> target. */
export function WatchCard({
  title,
  meta,
  nowKobo,
  startKobo,
  targetKobo,
  imageUri,
  icon,
  onPress,
}: {
  title: string;
  meta: string;
  nowKobo: number;
  startKobo: number;
  targetKobo: number;
  imageUri?: string | null;
  icon?: LucideIcon;
  onPress?: () => void;
}) {
  const dropped = startKobo - nowKobo;
  const progress = watchProgress(startKobo, nowKobo, targetKobo);
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${title}, now ${formatNaira(nowKobo)}, target ${formatNaira(targetKobo)}`}
      onPress={onPress}
      style={{
        gap: 12,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 20,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Thumb name={title} uri={imageUri} size={52} radius={14} iconSize={26} {...(icon ? { icon } : {})} />
        <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
          <Text variant="label" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="smallRegular" style={{ color: colors.muted }} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="priceM">{formatNaira(nowKobo)}</Text>
          <Text variant="mono" style={{ color: dropped > 0 ? colors.green : colors.muted }}>
            {dropped > 0 ? `↓ ${formatNaira(dropped)}` : 'no change'}
          </Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{ height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              borderRadius: 4,
              backgroundColor: colors.ink,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="mono" style={{ color: colors.muted }}>
            started {formatNaira(startKobo)}
          </Text>
          <Text variant="mono">target {formatNaira(targetKobo)}</Text>
        </View>
      </View>
    </PressableScale>
  );
}
