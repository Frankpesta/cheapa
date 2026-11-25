import { colors } from '@cheapa/config/tokens';
import type { Condition, PriceKind } from '@cheapa/core/client';
import { View } from 'react-native';
import { formatNaira, seenLabel } from '../lib/format';
import { priceText } from '../lib/results';
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
 * a 2 px ink border. From-prices keep "From", ranges show the top end, packs show the
 * price each (06 §6.3); an out-of-stock row says so and its price goes muted.
 */
export function ListingRow({
  storeName,
  condition,
  priceKobo,
  priceKind = 'exact',
  priceMaxKobo,
  packCount,
  oldPriceKobo,
  inStock = true,
  lastSeenAt,
  live = false,
  flag,
  best = false,
  onPress,
}: {
  storeName: string;
  condition: Condition;
  priceKobo: number;
  priceKind?: PriceKind;
  priceMaxKobo?: number | undefined;
  packCount?: number | undefined;
  oldPriceKobo?: number | null;
  inStock?: boolean;
  lastSeenAt: Date | string;
  live?: boolean;
  flag?: ListingFlag;
  best?: boolean;
  onPress?: () => void;
}) {
  const f = flag ? FLAG[flag] : null;
  const p = priceText({ priceKind, priceKobo, priceMaxKobo, packCount }, formatNaira);
  const shown = `${p.prefix ? 'From ' : ''}${formatNaira(priceKobo)}${p.upTo ? ` to ${formatNaira(p.upTo)}` : ''}`;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${storeName}, ${shown}${inStock ? '' : ', out of stock'}`}
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
            {inStock ? seenLabel(lastSeenAt, live) : 'out of stock'}
          </Text>
          {f ? <Pill kind={f.kind} label={f.label} /> : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {p.prefix ? (
          <Text variant="mono" style={{ fontSize: 11, color: colors.muted }}>
            FROM
          </Text>
        ) : null}
        <Text variant="priceM" style={inStock ? undefined : { color: colors.muted }}>
          {formatNaira(priceKobo)}
        </Text>
        {p.upTo ? (
          <Text variant="smallRegular" style={{ fontSize: 12, lineHeight: 16, color: colors.muted }}>
            to {formatNaira(p.upTo)}
          </Text>
        ) : null}
        {p.perItem ? (
          <Text variant="mono" style={{ fontSize: 11, color: colors.muted }}>
            {p.perItem}
          </Text>
        ) : null}
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
