import { colors } from '@cheapa/config/tokens';
import type { SearchResponse } from '@cheapa/core/client';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheet, Button, RadioOption, Text } from '../../components';
import { formatNaira } from '../../lib/format';
import { QueryField } from '../QueryField';

type Confirmation = NonNullable<SearchResponse['needsConfirmation']>;

/**
 * Confirm.dc.html: "Which X did you see?" when the API returns a variant question. Each
 * option is a product in the response; FROM is its cheapest new price when known.
 */
export function ConfirmSheet({
  visible,
  confirmation,
  products,
  initialId,
  onPick,
  onNone,
  onClose,
}: {
  visible: boolean;
  confirmation: Confirmation;
  products: SearchResponse['products'];
  initialId?: string | undefined;
  onPick: (productId: string) => void;
  onNone: () => void;
  onClose: () => void;
}) {
  const options = confirmation.options.filter((o) => o.productId);
  const [picked, setPicked] = useState(initialId ?? options[0]?.productId);
  const chosen = options.find((o) => o.productId === picked);
  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow="QUICK CHECK" title={confirmation.question}>
      <Text variant="body" style={{ marginTop: 8, marginBottom: 18, color: colors.body2 }}>
        Size and storage change the price a lot, so we check before comparing.
      </Text>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {options.map((o) => {
          const p = products.find((x) => x.productId === o.productId);
          const stores = p ? new Set(p.listings.map((l) => l.storeName)).size : 0;
          const from = p?.cheapestNewKobo ?? p?.cheapestUsedKobo;
          return (
            <RadioOption
              key={o.productId}
              title={o.label}
              {...(p ? { subtitle: `${p.listingCount} listings · ${stores} stores` } : {})}
              {...(from != null ? { price: formatNaira(from) } : {})}
              selected={o.productId === picked}
              onPress={() => setPicked(o.productId)}
            />
          );
        })}
      </View>
      <Button
        label={chosen ? `Compare ${chosen.label} prices` : 'Compare prices'}
        size="lg"
        trailingArrow
        disabled={!chosen}
        onPress={() => chosen?.productId && onPick(chosen.productId)}
        style={{ marginTop: 20 }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onNone}
        style={{ marginTop: 8, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="label" style={{ color: colors.green }}>
          None of these, let me type it
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

/**
 * "Not it?" correction: type what it really is and re-run as a text search (06 §6.3).
 * No design file; composed from BottomSheet + the NotFound field. Flagged for review.
 */
export function EditSheet({
  visible,
  initial,
  onSearch,
  onClose,
}: {
  visible: boolean;
  initial: string;
  onSearch: (query: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow="NOT IT?" title="What is it?">
      <Text variant="body" style={{ marginTop: 8, marginBottom: 18, color: colors.body2 }}>
        Type the brand and model, or describe it. We'll search by name.
      </Text>
      <QueryField initial={initial} onSubmit={onSearch} autoFocus />
    </BottomSheet>
  );
}
