import { colors } from '@cheapa/config/tokens';
import type { SearchResponse } from '@cheapa/core/client';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Pill, PressableScale, Text, Thumb } from '../../components';
import { formatNaira } from '../../lib/format';

type Lookalike = SearchResponse['lookalikes'][number];

/**
 * "Looks like this, for less" (06 §6.3, 13 §13.7): a 2-column image grid under the exact
 * matches, or the main result when nothing matched exactly. Not in Results.dc.html yet;
 * composed from Thumb, Pill and the type scale, flagged for design review.
 */
export function Lookalikes({ items, primary }: { items: readonly Lookalike[]; primary: boolean }) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: primary ? 14 : 24, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading" accessibilityRole="header">
          {primary ? 'No exact match. These look like it' : 'Looks like this, for less'}
        </Text>
        <Text variant="smallRegular" style={{ color: colors.muted }}>
          Similar items, closest first, then cheapest.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((l) => (
          <Card key={l.productId} item={l} />
        ))}
      </View>
    </View>
  );
}

function Card({ item }: { item: Lookalike }) {
  const price = `${item.priceKind === 'exact' ? '' : 'From '}${formatNaira(item.cheapestKobo)}`;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${item.title}, ${price} at ${item.storeName}`}
      onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: item.slug } })}
      style={{
        // Two columns inside 16 px gutters with a 10 px gap.
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 8,
        gap: 6,
      }}
    >
      <Thumb
        name={item.title}
        uri={item.repImageUrl}
        size={150}
        height={150}
        radius={12}
        iconSize={30}
        fill
      />
      <Text variant="label" style={{ fontSize: 13, lineHeight: 17 }} numberOfLines={2}>
        {item.title}
      </Text>
      <Text variant="priceS">{price}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text variant="mono" style={{ color: colors.muted }} numberOfLines={1}>
          {item.storeName}
        </Text>
        {item.band === 'very_close' ? <Pill kind="new" label="Very close" /> : null}
      </View>
    </PressableScale>
  );
}
