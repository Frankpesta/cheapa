import { colors, fonts, tintFor } from '@cheapa/config/tokens';
import type { ProductResponse } from '@cheapa/core/client';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ArrowRight, Package, Share2, TrendingDown } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Icon,
  IconButton,
  PriceChart,
  PressableScale,
  ReceiptDivider,
  SegmentedControl,
  Spinner,
  Text,
} from '../../components';
import { openListing } from '../../features/search/Results';
import { NotFound } from '../../features/search/NotFound';
import { api, errorMessage } from '../../lib/api';
import { ago, formatNaira } from '../../lib/format';
import { thumbUrl } from '../../lib/images';
import { usePrefs } from '../../lib/prefs';
import { cheapest, listingViews } from '../../lib/results';
import { useStartSearch } from '../../lib/use-start-search';

type Range = '7' | '30' | '90';
const RANGES = [
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
] as const;

/** Product.dc.html: image, deal check, price chart, store table, Buy bar. */
export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const start = useStartSearch();
  const product = useQuery({ queryKey: ['product', slug], queryFn: () => api.product(slug) });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (product.isPending) {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground }}
      >
        <Spinner />
      </View>
    );
  }
  if (product.isError) {
    return (
      <NotFound
        title="Can't open this product."
        body={errorMessage(product.error)}
        onBack={back}
        onSearch={(q) => start.text(q, 'text', true)}
      />
    );
  }
  return <ProductView p={product.data} onBack={back} />;
}

function ProductView({ p, onBack }: { p: ProductResponse; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  // The hero is the one large image in the app: 600 px, or a 300 px thumbnail on data saver.
  const { dataSaver } = usePrefs();
  const hero = thumbUrl(p.repImageUrl, dataSaver ? 300 : 600);
  const [range, setRange] = useState<Range>('30');
  const history = useQuery({
    queryKey: ['product-history', p.productId, range],
    queryFn: () => api.priceHistory(p.productId, Number(range)),
  });
  const month = useQuery({
    queryKey: ['product-history', p.productId, '30'],
    queryFn: () => api.priceHistory(p.productId, 30),
  });
  const best = cheapest(p.listings, 'new') ?? cheapest(p.listings, 'used');
  const values = history.data?.points.map((pt) => pt.minPriceKobo) ?? [];
  const low30 = month.data?.points.length
    ? Math.min(...month.data.points.map((pt) => pt.minPriceKobo))
    : null;
  const goodTime = p.minPriceKobo != null && low30 != null && p.minPriceKobo <= low30;
  const eyebrow = [p.brand, p.category?.replace(/_/g, ' ')].filter(Boolean).join(' · ').toUpperCase();
  const tint = tintFor(p.title);

  const share = () => {
    const line = best ? `${p.title}: ${formatNaira(best.priceKobo)} at ${best.storeName}` : p.title;
    void Share.share({ message: `${line}. Found on Cheapa.` });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View
          style={{
            height: 250 + insets.top,
            backgroundColor: tint.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {hero ? (
            <Image
              source={{ uri: hero }}
              style={{ width: '70%', height: 190, marginTop: insets.top + 30 }}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={{ marginTop: insets.top }}>
              <Icon as={Package} size={64} color={tint.fg} />
            </View>
          )}
          <View
            style={{
              position: 'absolute',
              top: insets.top + 10,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <IconButton icon={ArrowLeft} label="Back" tone="light" onPress={onBack} />
            <IconButton icon={Share2} label="Share product" tone="light" onPress={share} />
          </View>
        </View>

        <View style={{ paddingTop: 16, paddingHorizontal: 20, gap: 14 }}>
          <View style={{ gap: 4 }}>
            {eyebrow ? (
              <Text variant="mono" style={{ letterSpacing: 1, color: colors.muted }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text variant="displayM" accessibilityRole="header">
              {p.title}
            </Text>
          </View>

          {goodTime ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: colors.newBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon as={TrendingDown} size={20} color={colors.newFg} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">Good time to buy</Text>
                <Text variant="smallRegular" style={{ color: colors.muted }}>
                  Lowest price we've seen in 30 days
                </Text>
              </View>
            </View>
          ) : null}

          {values.length > 1 || history.isPending ? (
            <View
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 18,
                padding: 14,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="label" style={{ fontSize: 14 }}>
                  Cheapest price
                </Text>
                <SegmentedControl
                  options={RANGES}
                  value={range}
                  onChange={setRange}
                  accessibilityLabel="Price history range"
                />
              </View>
              {values.length > 1 ? (
                <PriceChart
                  valuesKobo={values}
                  accessibilityLabel={`Cheapest price over ${range} days, now ${formatNaira(values[values.length - 1]!)}`}
                />
              ) : (
                <View style={{ height: 130, alignItems: 'center', justifyContent: 'center' }}>
                  <Spinner />
                </View>
              )}
            </View>
          ) : null}

          <StoreTable p={p} />
        </View>
      </ScrollView>

      {best ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.card,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            paddingTop: 12,
            paddingHorizontal: 16,
            paddingBottom: Math.max(30, insets.bottom + 12),
          }}
        >
          <Button
            label={`Buy at ${best.storeName}`}
            variant="primary-lime"
            size="lg"
            accessibilityLabel={`Buy at ${best.storeName} for ${formatNaira(best.priceKobo)}`}
            onPress={() => openListing(best.url)}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="priceS">{formatNaira(best.priceKobo)}</Text>
                <Icon as={ArrowRight} />
              </View>
            }
          />
        </View>
      ) : null}
    </View>
  );
}

/** Dashed-divider store rows: store, mono "seen", price (cheapest bolder). */
function StoreTable({ p }: { p: ProductResponse }) {
  const rows = listingViews(p.listings);
  if (rows.length === 0) {
    return (
      <Text variant="smallRegular" style={{ color: colors.muted }}>
        No store has this in stock right now.
      </Text>
    );
  }
  return (
    <View>
      {rows.map(({ listing: l, best }, i) => (
        <View key={l.listingId}>
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={`${l.storeName}, ${formatNaira(l.priceKobo)}`}
            onPress={() => openListing(l.url)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46 }}
          >
            <Text variant="label" style={{ flex: 1, fontSize: 14 }} numberOfLines={1}>
              {l.storeName}
              {l.condition === 'new' || l.condition === 'unknown' ? '' : ' · used'}
            </Text>
            <Text variant="mono" style={{ color: colors.muted }}>
              {ago(l.lastSeenAt)}
            </Text>
            <Text
              variant="priceS"
              style={{ width: 92, textAlign: 'right', ...(best ? {} : { fontFamily: fonts.displayBold }) }}
            >
              {formatNaira(l.priceKobo)}
            </Text>
          </PressableScale>
          {i < rows.length - 1 ? <ReceiptDivider /> : null}
        </View>
      ))}
    </View>
  );
}
