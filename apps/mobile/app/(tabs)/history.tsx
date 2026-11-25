import { colors, tintFor } from '@cheapa/config/tokens';
import type { SearchHistoryItem } from '@cheapa/core/client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Camera, ImageIcon, Link, Search, Share, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, ReceiptDivider, Spinner, Text, Thumb } from '../../components';
import { api } from '../../lib/api';
import { formatNaira } from '../../lib/format';
import { groupHistory, historyTitle, SOURCE_WORD, whenLabel } from '../../lib/history';
import { useStartSearch } from '../../lib/use-start-search';

const SOURCE_ICON: Record<SearchHistoryItem['source'], LucideIcon> = {
  camera: Camera,
  share: Share,
  gallery: ImageIcon,
  text: Search,
  link: Link,
};

/** History.dc.html: past searches grouped by day, privacy note, clear all. */
export default function History() {
  const client = useQueryClient();
  const start = useStartSearch();
  const list = useInfiniteQuery({
    queryKey: ['searches', 'all'],
    queryFn: ({ pageParam }) => api.searches(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const clear = useMutation({
    mutationFn: api.clearSearches,
    onSuccess: () => void client.invalidateQueries({ queryKey: ['searches'] }),
  });
  // "Clear all" asks twice instead of a dialog (Alert is a no-op on web).
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(t);
  }, [arming]);

  const now = new Date();
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const sections = groupHistory(items, now);

  const open = (item: SearchHistoryItem) => {
    if (item.topProduct) router.push({ pathname: '/product/[slug]', params: { slug: item.topProduct.slug } });
    else if (item.query) start.text(item.query, 'text');
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 32 }}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <Text variant="displayL" accessibilityRole="header">
                History
              </Text>
              {items.length ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (!arming) return setArming(true);
                    setArming(false);
                    clear.mutate();
                  }}
                  style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}
                >
                  <Text
                    variant="label"
                    style={{ fontSize: 14, color: arming ? colors.dropFg : colors.green }}
                  >
                    {arming ? 'Tap again to clear' : 'Clear all'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginBottom: 4,
              }}
            >
              <Icon as={ShieldCheck} size={18} color={colors.green} />
              <Text variant="smallRegular" style={{ flex: 1, color: colors.body2 }}>
                Your photos are never saved. We keep only what we found.
              </Text>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            variant="mono"
            style={{ letterSpacing: 1, color: colors.muted, marginTop: 14, marginBottom: 2 }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => (
          <View>
            <Row item={item} now={now} onPress={() => open(item)} />
            {index < section.data.length - 1 ? <ReceiptDivider /> : null}
          </View>
        )}
        ListEmptyComponent={
          list.isPending ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <Spinner />
            </View>
          ) : (
            <Text variant="body" style={{ color: colors.muted, marginTop: 20 }}>
              {list.isError
                ? "Couldn't load your history. Pull down to try again."
                : 'Nothing here yet. Snap something!'}
            </Text>
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Spinner /> : undefined}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
      />
    </SafeAreaView>
  );
}

function Row({ item, now, onPress }: { item: SearchHistoryItem; now: Date; onPress: () => void }) {
  const title = historyTitle(item);
  const top = item.topProduct;
  const price = top?.cheapestNewKobo ?? top?.cheapestUsedKobo;
  const tint = tintFor(title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={!top && !item.query}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
    >
      {top?.repImageUrl ? (
        <Thumb name={title} uri={top.repImageUrl} size={44} radius={13} />
      ) : (
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            backgroundColor: tint.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon as={SOURCE_ICON[item.source]} color={tint.fg} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon as={SOURCE_ICON[item.source]} size={13} color={colors.muted} />
          <Text variant="caption" style={{ color: colors.muted }}>
            {SOURCE_WORD[item.source]} · {whenLabel(new Date(item.createdAt), now)}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {price != null ? <Text variant="priceS">{formatNaira(price)}</Text> : null}
        <Text variant="mono" style={{ color: colors.muted }}>
          {top
            ? `${top.listingCount} ${top.listingCount === 1 ? 'listing' : 'listings'}${top.cheapestNewKobo == null && price != null ? ' · used' : ''}`
            : item.resultCount
              ? `${item.resultCount} results`
              : 'no match'}
        </Text>
      </View>
    </Pressable>
  );
}
