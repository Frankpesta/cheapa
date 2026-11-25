import { colors } from '@cheapa/config/tokens';
import type { SearchListing } from '@cheapa/core/client';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BottomSheet, Button, Chip, Text, Toggle } from '../../components';
import {
  filterOptions,
  matchesFilters,
  noFilters,
  type FilterOption,
  type ListingFilters,
} from '../../lib/results';

type Group = 'sizes' | 'colours' | 'stores';

/**
 * Size, colour, store and stock filters behind the Results filter chip (06 §6.3). The
 * design shows the chip but not the sheet, so this is composed from BottomSheet + Chip +
 * Toggle and flagged for design review. Choices are a draft until "Show N listings".
 */
export function FilterSheet({
  visible,
  listings,
  filters,
  onApply,
  onClose,
}: {
  visible: boolean;
  listings: readonly SearchListing[];
  filters: ListingFilters;
  onApply: (next: ListingFilters) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const options = useMemo(() => filterOptions(listings), [listings]);
  const count = listings.filter((l) => matchesFilters(l, draft)).length;

  const toggle = (group: Group, value: string) =>
    setDraft((d) => ({
      ...d,
      [group]: d[group].includes(value) ? d[group].filter((v) => v !== value) : [...d[group], value],
    }));

  return (
    <BottomSheet visible={visible} onClose={onClose} eyebrow="FILTERS" title="Narrow it down" fill>
      <ScrollView style={{ flex: 1, marginTop: 8 }} contentContainerStyle={{ gap: 22, paddingBottom: 12 }}>
        <Section
          title="SIZE"
          options={options.sizes}
          picked={draft.sizes}
          onToggle={(v) => toggle('sizes', v)}
        />
        <Section
          title="COLOUR"
          options={options.colours}
          picked={draft.colours}
          onToggle={(v) => toggle('colours', v)}
        />
        <Section
          title="STORE"
          options={options.stores}
          picked={draft.stores}
          onToggle={(v) => toggle('stores', v)}
        />
        {options.outOfStock > 0 ? (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">In stock only</Text>
              <Text variant="smallRegular" style={{ color: colors.muted }}>
                Hides {options.outOfStock} sold-out {options.outOfStock === 1 ? 'listing' : 'listings'}
              </Text>
            </View>
            <Toggle
              value={draft.inStockOnly}
              onChange={(inStockOnly) => setDraft((d) => ({ ...d, inStockOnly }))}
              accessibilityLabel="In stock only"
            />
          </View>
        ) : null}
      </ScrollView>

      <Button
        label={count === 0 ? 'No listings match' : `Show ${count} ${count === 1 ? 'listing' : 'listings'}`}
        size="lg"
        disabled={count === 0}
        onPress={() => onApply(draft)}
        style={{ marginTop: 12 }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => setDraft(noFilters(draft.condition))}
        style={{ marginTop: 4, height: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text variant="label" style={{ color: colors.green }}>
          Clear filters
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

/** One group of chips; hidden when the listings give fewer than two choices. */
function Section({
  title,
  options,
  picked,
  onToggle,
}: {
  title: string;
  options: readonly FilterOption[];
  picked: readonly string[];
  onToggle: (value: string) => void;
}) {
  if (options.length < 2 && picked.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text variant="monoLabel" accessibilityRole="header" style={{ color: colors.muted }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.value}
            count={o.count}
            selected={picked.includes(o.value)}
            onPress={() => onToggle(o.value)}
          />
        ))}
      </View>
    </View>
  );
}
