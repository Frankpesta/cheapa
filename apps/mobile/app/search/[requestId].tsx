import { colors } from '@cheapa/config/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '../../components';
import { NotFound } from '../../features/search/NotFound';
import { Results } from '../../features/search/Results';
import { Searching } from '../../features/search/Searching';
import { ConfirmSheet, EditSheet } from '../../features/search/Sheets';
import { errorMessage } from '../../lib/api';
import { usePrefs } from '../../lib/prefs';
import { detectedName, isEmpty, primaryProduct } from '../../lib/results';
import { searchInput, startSearch, useSearch } from '../../lib/search-session';
import { useStartSearch } from '../../lib/use-start-search';

/** Searching → Results (+ Confirm sheet) or NotFound, for one search (DESIGN.md §3, 05–07, 12). */
export default function SearchScreen() {
  const { requestId, thumb } = useLocalSearchParams<{ requestId: string; thumb?: string }>();
  const input = searchInput(requestId);
  const query = useSearch(requestId);
  const prefs = usePrefs();
  const start = useStartSearch();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const res = query.data;
  const variantQuestion = res?.needsConfirmation?.kind === 'variant' ? res.needsConfirmation : null;

  // Ask the variant question once, as soon as results land (Confirm.dc.html).
  useEffect(() => {
    if (variantQuestion) setConfirmOpen(true);
  }, [variantQuestion]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const retype = (q: string) => {
    setEditOpen(false);
    start.text(q, 'text', true);
  };
  const typed = input?.kind === 'text' ? input.query : undefined;

  // Opened from a stale link or after a reload: the photo is gone (never stored), so start over.
  if (!input && !res) {
    return (
      <NotFound
        title="This search has ended."
        body="We don't keep your photos, so we can't reopen this one. Type what you're looking for instead."
        onBack={back}
        onSearch={retype}
      />
    );
  }

  // Offline: the query is paused (lib/network.ts) and runs by itself when the connection returns.
  if (query.isPending && input) {
    return <Searching input={input} thumb={thumb} waiting={query.fetchStatus === 'paused'} onCancel={back} />;
  }

  if (query.isError || !res) {
    return <Failed message={errorMessage(query.error)} onRetry={() => void query.refetch()} onBack={back} />;
  }

  const name = detectedName(res.detected, typed);

  if (isEmpty(res)) {
    return (
      <NotFound
        initialQuery={typed ?? (res.detected.brand || res.detected.model ? name : '')}
        onBack={back}
        onSearch={retype}
      />
    );
  }

  const product = primaryProduct(res, pickedId);
  return (
    <View style={{ flex: 1 }}>
      <Results
        response={res}
        product={product}
        name={product && pickedId ? product.title : name}
        thumb={thumb}
        newOnly={prefs.newOnly}
        currentItem={input?.kind === 'image' ? (input.item ?? 0) : 0}
        onNotIt={() => (variantQuestion ? setConfirmOpen(true) : setEditOpen(true))}
        onPickItem={(item) => {
          if (input?.kind !== 'image') return;
          const id = startSearch({ ...input, item });
          router.replace({
            pathname: '/search/[requestId]',
            params: { requestId: id, ...(thumb ? { thumb } : {}) },
          });
        }}
        onBack={back}
      />
      {variantQuestion ? (
        <ConfirmSheet
          visible={confirmOpen}
          confirmation={variantQuestion}
          products={res.products}
          initialId={pickedId ?? product?.productId}
          onPick={(id) => {
            setPickedId(id);
            setConfirmOpen(false);
          }}
          onNone={() => {
            setConfirmOpen(false);
            setEditOpen(true);
          }}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
      <EditSheet
        visible={editOpen}
        initial={typed ?? name}
        onSearch={retype}
        onClose={() => setEditOpen(false)}
      />
    </View>
  );
}

/** Network or server failure. No design: composed from the type scale and Button; flagged. */
function Failed({ message, onRetry, onBack }: { message: string; onRetry: () => void; onBack: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 14 }}>
        <Text variant="displayM" accessibilityRole="header">
          Wahala dey.
        </Text>
        <Text variant="body" style={{ color: colors.body2 }}>
          {message}
        </Text>
        <Button label="Try again" onPress={onRetry} />
        <Button label="Back" variant="ghost" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}
