import { colors } from '@cheapa/config/tokens';
import type { Condition } from '@cheapa/core/client';
import { View } from 'react-native';
import { formatNaira, seenLabel } from '../lib/format';
import { ConditionPill, Pill } from './Pills';
import { PressableScale } from './Pressable';
import { StoreAvatar } from './Thumb';
import { Text } from './Text';

export type ListingFlag = 'cheapest' | 'warn' | 'live' | 'sponsored';

const FLAG = {
  cheapest: { kind: 'new', label: 'Cheapest new' },
  warn: { kind: 'warn', label: 'Check seller' },
  live: { kind: 'live', label: 'Live' },
  sponsored: { kind: 'premium', label: 'Sponsored' },
} as const;

/**
 * Results listing row: avatar 40 (store initials on tint), store + condition pill, mono
 * "seen" line + flag, price right with the struck old price. `best` (cheapest new) gets
 * a 2 px ink border.
 */
export function ListingRow({
  storeName,
  condition,
  priceKobo,
  oldPriceKobo,
  lastSeenAt,
  live = false,
  flag,
  best = false,
  onPress,
}: {
  storeName: string;
  condition: Condition;
  priceKobo: number;
  oldPriceKobo?: number | null;
  lastSeenAt: Date | string;
  live?: boolean;
  flag?: ListingFlag;
  best?: boolean;
  onPress?: () => void;
}) {
  const f = flag ? FLAG[flag] : null;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${storeName}, ${formatNaira(priceKobo)}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: best ? 11 : 12,
        backgroundColor: colors.card,
        borderWidth: best ? 2 : 1,
        borderColor: best ? colors.ink : colors.line,
        borderRadius: 16,
      }}
    >
      <StoreAvatar store={storeName} />
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {storeName}
          </Text>
          <ConditionPill condition={condition} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="mono" style={{ color: colors.muted }}>
            {seenLabel(lastSeenAt, live)}
          </Text>
          {f ? <Pill kind={f.kind} label={f.label} /> : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="priceM">{formatNaira(priceKobo)}</Text>
        {oldPriceKobo ? (
          <Text
            variant="smallRegular"
            style={{ fontSize: 12, lineHeight: 16, color: colors.strike, textDecorationLine: 'line-through' }}
          >
            {formatNaira(oldPriceKobo)}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}
