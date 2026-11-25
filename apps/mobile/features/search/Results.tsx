import { colors } from '@cheapa/config/tokens';
import type { SearchResponse } from '@cheapa/core/client';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, ListFilter, Share2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Chip,
  DetectedCard,
  IconButton,
  ListingRow,
  PriceSummaryCard,
  ProductRowCompact,
  Text,
} from '../../components';
import { goUrl } from '../../lib/api';
import { formatNaira } from '../../lib/format';
import {
  applyFilters,
  countsLine,
  filteredConditionCounts,
  filterOptions,
  isLiveOnly,
  listingViews,
  noFilters,
  sheetFilterCount,
  summaryNotes,
  variantLine,
  type ConditionFilter,
} from '../../lib/results';
import { FilterSheet } from './FilterSheet';
import { Lookalikes } from './Lookalikes';

type Product = SearchResponse['products'][number];

/** Opens the tracked /go link in the in-app browser so affiliate tracking works (06 §6.3). */
export function openListing(url: string, requestId?: string) {
  void WebBrowser.openBrowserAsync(goUrl(url, requestId), {
    toolbarColor: colors.ground,
    controlsColor: colors.ink,
  });
}

/** Results.dc.html, plus the item chips (06 §6.3) and "Looks like this, for less" (13 §13.7). */
export function Results({
  response,
  product,
  name,
  thumb,
  newOnly,
  currentItem,
  onNotIt,
  onPickItem,
  onBack,
}: {
  response: SearchResponse;
  /** The product in focus; null when only lookalikes matched. */
  product: Product | null;
  name: string;
  thumb?: string | undefined;
  newOnly: boolean;
  /** Which detected item this search is for (item chips). */
  currentItem: number;
  onNotIt: () => void;
  onPickItem: (itemIndex: number) => void;
  onBack: () => void;
}) {
  const [filters, setFilters] = useState(() => noFilters(newOnly ? 'new' : 'all'));
  const [sheetOpen, setSheetOpen] = useState(false);
  const listings = useMemo(() => product?.listings ?? [], [product]);
  const views = useMemo(() => listingViews(listings), [listings]);
  const options = useMemo(() => filterOptions(listings), [listings]);
  const counts = filteredConditionCounts(listings, filters);
  const shown = applyFilters(views, filters);
  const active = sheetFilterCount(filters);
  const filterable =
    options.sizes.length > 1 ||
    options.colours.length > 1 ||
    options.stores.length > 1 ||
    options.outOfStock > 0;
  const filter = filters.condition;
  const setFilter = (condition: ConditionFilter) => setFilters((f) => ({ ...f, condition }));

  // Another product picked (Confirm sheet, item chips): its sizes and stores differ.
  const productId = product?.productId;
  useEffect(() => {
    setFilters((f) => noFilters(f.condition));
  }, [productId]);
  const summary = summaryNotes(listings);
  const items = response.needsConfirmation?.kind === 'item' ? response.needsConfirmation.options : [];
  const others = response.products.flatMap((p) => {
    const price = p.cheapestNewKobo ?? p.cheapestUsedKobo;
    return p.productId !== product?.productId && price != null ? [{ p, price }] : [];
  });

  const share = () => {
    const best = summary.newPrice ?? summary.usedPrice;
    const line = best ? `${name}: ${formatNaira(best.kobo)} ${best.note}` : name;
    void Share.share({ message: `${line}. Found on Cheapa.` });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <View
        style={{
          paddingTop: 10,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <IconButton icon={ArrowLeft} label="Back" onPress={onBack} />
        <Text variant="label" style={{ fontSize: 16 }}>
          {product ? countsLine(listings) : 'Similar items'}
        </Text>
        <IconButton icon={Share2} label="Share results" onPress={share} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}>
        <DetectedCard
          name={name}
          {...(variantLine(response.detected.variant)
            ? { detail: variantLine(response.detected.variant) }
            : {})}
          imageUri={thumb ?? product?.repImageUrl ?? null}
          onNotIt={onNotIt}
        />

        {items.length > 1 ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text variant="small" style={{ color: colors.muted }}>
              {response.needsConfirmation?.question}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {items.map((o) => (
                <Chip
                  key={o.label}
                  label={o.label}
                  selected={o.itemIndex === currentItem}
                  onPress={() =>
                    o.itemIndex !== undefined && o.itemIndex !== currentItem && onPickItem(o.itemIndex)
                  }
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {product ? (
          <>
            <View style={{ marginTop: 10 }}>
              <PriceSummaryCard
                newPrice={summary.newPrice}
                usedPrice={summary.usedPrice}
                onPressNew={() => setFilter('new')}
                onPressUsed={() => setFilter('used')}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <Chip
                label="All"
                count={counts.all}
                selected={filter === 'all'}
                onPress={() => setFilter('all')}
              />
              <Chip
                label="New"
                count={counts.new}
                selected={filter === 'new'}
                onPress={() => setFilter('new')}
              />
              <Chip
                label="Used"
                count={counts.used}
                selected={filter === 'used'}
                onPress={() => setFilter('used')}
              />
              <View style={{ flex: 1 }} />
              {filterable ? (
                <Chip
                  icon={ListFilter}
                  {...(active ? { count: active } : {})}
                  selected={active > 0}
                  accessibilityLabel={active ? `Filters, ${active} on` : 'Filters'}
                  onPress={() => setSheetOpen(true)}
                />
              ) : null}
            </View>

            <View style={{ gap: 8, marginTop: 12 }}>
              {shown.map(({ listing: l, flag, best }) => (
                <ListingRow
                  key={l.listingId}
                  storeName={l.storeName}
                  condition={l.condition}
                  priceKobo={l.priceKobo}
                  priceKind={l.priceKind}
                  priceMaxKobo={l.priceMaxKobo}
                  packCount={l.packCount}
                  oldPriceKobo={l.oldPriceKobo ?? null}
                  inStock={l.inStock}
                  lastSeenAt={l.lastSeenAt}
                  live={l.flags.live === true}
                  {...(flag ? { flag } : {})}
                  best={best}
                  onPress={() => openListing(l.url, response.requestId)}
                />
              ))}
              {shown.length === 0 ? (
                <Text variant="smallRegular" style={{ color: colors.muted, paddingVertical: 12 }}>
                  {active ? 'No listings match these filters. ' : `No ${filter} listings for this one.`}
                  {active ? (
                    <Text
                      variant="smallRegular"
                      accessibilityRole="button"
                      onPress={() => setFilters(noFilters(filter))}
                      style={{ color: colors.green }}
                    >
                      Clear filters
                    </Text>
                  ) : null}
                </Text>
              ) : null}
            </View>

            {isLiveOnly(product) ? null : <ProductLink product={product} />}
          </>
        ) : null}

        <Lookalikes items={response.lookalikes} primary={!product} />

        {others.length ? (
          <View style={{ marginTop: 22, gap: 10 }}>
            <Text variant="heading" accessibilityRole="header">
              Other matches
            </Text>
            {others.map(({ p, price }) => (
              <ProductRowCompact
                key={p.productId}
                title={p.title}
                meta={`${p.listingCount} listings${p.cheapestNewKobo == null ? ' · used' : ''}`}
                priceKobo={price}
                imageUri={p.repImageUrl}
                // Live-only products have no catalog page; their row opens the store instead.
                onPress={() =>
                  isLiveOnly(p)
                    ? p.listings[0] && openListing(p.listings[0].url, response.requestId)
                    : router.push({ pathname: '/product/[slug]', params: { slug: p.slug } })
                }
              />
            ))}
          </View>
        ) : null}

        <Text variant="caption" style={{ marginTop: 18, color: colors.muted, textAlign: 'center' }}>
          Sorted by price; flagged listings sit last. We may earn a commission, never at the cost of order.
        </Text>
      </ScrollView>

      <FilterSheet
        visible={sheetOpen}
        listings={listings}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

function ProductLink({ product }: { product: Product }) {
  return (
    <Text
      variant="label"
      accessibilityRole="link"
      onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: product.slug } })}
      style={{ marginTop: 14, fontSize: 14, color: colors.green, textAlign: 'center', paddingVertical: 12 }}
    >
      Price history and all stores
    </Text>
  );
}
