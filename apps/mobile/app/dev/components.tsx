import { colors } from '@cheapa/config/tokens';
import { Redirect, router } from 'expo-router';
import { ArrowLeft, Bell, Camera, ListFilter, Shirt, Smartphone, Tv } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheet,
  Button,
  Chip,
  ConditionPill,
  DetectedCard,
  IconButton,
  ListingRow,
  LogoMark,
  Pill,
  PriceChart,
  PriceSummaryCard,
  ProductRowCompact,
  ProgressChecklist,
  QuickPick,
  RadioOption,
  ReceiptDivider,
  SegmentedControl,
  SettingsGroup,
  SettingsItem,
  TabBar,
  Text,
  Toggle,
  WatchCard,
  type TabKey,
} from '../../components';
import { formatNaira } from '../../lib/format';
import { chart30, confirmOptions, fashionListings, listings } from '../../dev/samples';
import { FilterSheet } from '../../features/search/FilterSheet';
import { applyFilters, listingViews, noFilters, sheetFilterCount } from '../../lib/results';

/** Every DESIGN.md §2 component with design sample data (06 §6.0). Dev builds only. */
export default function ComponentGallery() {
  const [filter, setFilter] = useState<'all' | 'new' | 'used'>('all');
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [pick, setPick] = useState('10');
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [variant, setVariant] = useState('256');
  const [sheet, setSheet] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(() => noFilters());
  const [tab, setTab] = useState<TabKey>('home');
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <Text variant="label" style={{ fontSize: 16 }}>
          Components
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 28 }}>
        <Section title="Type">
          <Text variant="displayXL">Snap am.</Text>
          <Text variant="displayL">Watches</Text>
          <Text variant="displayM">Which Camon 30 did you see?</Text>
          <Text variant="priceL">{formatNaira(31_850_000)}</Text>
          <Text variant="body">Storage changes the price a lot, so we check before comparing.</Text>
          <Text variant="monoLabel" style={{ color: colors.muted }}>
            CHEAPEST NEW
          </Text>
          <LogoMark />
        </Section>

        <Section title="Button / IconButton">
          <Button label="Tell me when it drops" icon={Bell} />
          <Button label="Snap a product" variant="primary-lime" icon={Camera} />
          <Button label="See results now" variant="outline" />
          <Button label="None of these, let me type it" variant="ghost" />
          <Button label="Compare 256GB prices" size="lg" trailingArrow />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <IconButton icon={ArrowLeft} label="Back" tone="light" />
            <IconButton icon={ArrowLeft} label="Close" tone="soft" />
            <View style={{ backgroundColor: colors.ink, padding: 6, borderRadius: 12 }}>
              <IconButton icon={Camera} label="Flash" tone="camera" />
            </View>
          </View>
        </Section>

        <Section title="Chip / SegmentedControl / QuickPick">
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {(['all', 'new', 'used'] as const).map((f) => (
              <Chip
                key={f}
                label={f[0]!.toUpperCase() + f.slice(1)}
                count={f === 'all' ? 7 : f === 'new' ? 5 : 2}
                selected={filter === f}
                onPress={() => setFilter(f)}
              />
            ))}
            <View style={{ flex: 1 }} />
            <Chip icon={ListFilter} accessibilityLabel="Filters" />
          </View>
          <View style={{ alignSelf: 'flex-start' }}>
            <SegmentedControl
              accessibilityLabel="Price range"
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7D' },
                { value: '30', label: '30D' },
                { value: '90', label: '90D' },
              ]}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['5', '10', '15', 'any'].map((p) => (
              <QuickPick
                key={p}
                label={p === 'any' ? 'Any drop' : `−${p}%`}
                selected={pick === p}
                onPress={() => setPick(p)}
              />
            ))}
          </View>
        </Section>

        <Section title="Pills">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <ConditionPill condition="new" />
            <ConditionPill condition="uk_used" />
            <Pill kind="warn" label="Check seller" />
            <Pill kind="live" label="Live" />
            <Pill kind="premium" label="Premium" />
            <Pill kind="drop" label={'−14%'} />
          </View>
        </Section>

        <Section title="DetectedCard / PriceSummaryCard">
          <DetectedCard
            name="Tecno Camon 30"
            detail="8GB / 256GB"
            icon={Smartphone}
            onNotIt={() => setSheet(true)}
          />
          <DetectedCard
            name="Black satin slip dress"
            detail="Women"
            icon={Shirt}
            onNotIt={() => setSheet(true)}
          />
          <PriceSummaryCard
            newPrice={{ kobo: 31_850_000, note: 'at Slot · ₦41k below avg' }}
            usedPrice={{ kobo: 26_500_000, note: 'UK used · Jiji' }}
          />
        </Section>

        <Section title="ListingRow">
          {listings.map((l) => (
            <ListingRow
              key={l.store + l.priceKobo}
              storeName={l.store}
              condition={l.condition}
              priceKobo={l.priceKobo}
              oldPriceKobo={l.oldPriceKobo ?? null}
              lastSeenAt={l.seen}
              live={l.live ?? false}
              {...(l.flag ? { flag: l.flag } : {})}
              best={l.best ?? false}
            />
          ))}
        </Section>

        <Section title="ListingRow · From / range / pack / sold out + FilterSheet">
          <Chip
            icon={ListFilter}
            {...(sheetFilterCount(filters) ? { count: sheetFilterCount(filters) } : {})}
            selected={sheetFilterCount(filters) > 0}
            accessibilityLabel="Filters"
            onPress={() => setFilterOpen(true)}
          />
          {applyFilters(listingViews(fashionListings), filters).map(({ listing: l, flag, best }) => (
            <ListingRow
              key={l.listingId}
              storeName={l.storeName}
              condition={l.condition}
              priceKobo={l.priceKobo}
              priceKind={l.priceKind}
              priceMaxKobo={l.priceMaxKobo}
              packCount={l.packCount}
              inStock={l.inStock}
              lastSeenAt={l.lastSeenAt}
              {...(flag ? { flag } : {})}
              best={best}
            />
          ))}
          <FilterSheet
            visible={filterOpen}
            listings={fashionListings}
            filters={filters}
            onApply={(next) => {
              setFilters(next);
              setFilterOpen(false);
            }}
            onClose={() => setFilterOpen(false)}
          />
        </Section>

        <Section title="ProductRowCompact / WatchCard">
          <ProductRowCompact
            title={'Hisense 43" Smart TV'}
            meta="Konga · seen 2h ago"
            priceKobo={28_900_000}
            previousKobo={33_600_000}
            icon={Tv}
          />
          <WatchCard
            title="Tecno Camon 30 · 256GB"
            meta="New · watching 9 days"
            nowKobo={31_850_000}
            startKobo={35_900_000}
            targetKobo={30_250_000}
            icon={Smartphone}
          />
        </Section>

        <Section title="PriceChart / ReceiptDivider">
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 18,
              padding: 14,
            }}
          >
            <Text variant="label" style={{ fontSize: 14 }}>
              Cheapest new price
            </Text>
            <PriceChart
              valuesKobo={chart30}
              accessibilityLabel="Cheapest new price trend, now at its lowest"
            />
          </View>
          <ReceiptDivider />
        </Section>

        <Section title="ProgressChecklist">
          <ProgressChecklist
            steps={[
              { key: 'jumia', label: 'Jumia', status: 'done', note: '4 listings' },
              { key: 'slot', label: 'Slot', status: 'done', note: '1 listing' },
              { key: 'jiji', label: 'Jiji', status: 'active', note: 'checking…' },
              { key: 'rest', label: 'Pointek, 3CHUB and 8 more', status: 'pending' },
            ]}
          />
        </Section>

        <Section title="Toggle / SettingsGroup">
          <SettingsGroup>
            <SettingsItem
              label="Push notification"
              accessory={<Toggle value={push} onChange={setPush} accessibilityLabel="Push notification" />}
            />
            <SettingsItem
              label="Email"
              accessory={<Toggle value={email} onChange={setEmail} accessibilityLabel="Email" />}
            />
          </SettingsGroup>
          <SettingsGroup>
            <SettingsItem label="Notifications" value="Push" chevron onPress={() => undefined} />
            <SettingsItem label="Stores we check" value="14" chevron onPress={() => undefined} />
            <SettingsItem label="How Cheapa makes money" chevron onPress={() => undefined} />
          </SettingsGroup>
        </Section>

        <Section title="BottomSheet / RadioOption">
          <Button label="Open Confirm sheet" variant="outline" onPress={() => setSheet(true)} />
        </Section>

        <Section title="TabBar">
          <View style={{ marginHorizontal: -16, marginTop: 20 }}>
            <TabBar active={tab} onNavigate={setTab} onSnap={() => undefined} />
          </View>
        </Section>
      </ScrollView>

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow="QUICK CHECK"
        title="Which Camon 30 did you see?"
      >
        <Text variant="body" style={{ marginTop: 8, marginBottom: 18, color: colors.body2 }}>
          Storage changes the price a lot, so we check before comparing.
        </Text>
        <View style={{ gap: 10 }}>
          {confirmOptions.map((o) => (
            <RadioOption
              key={o.id}
              title={o.title}
              subtitle={o.subtitle}
              price={formatNaira(o.priceKobo)}
              selected={variant === o.id}
              onPress={() => setVariant(o.id)}
            />
          ))}
        </View>
        <Button
          label={`Compare ${variant}GB prices`}
          size="lg"
          trailingArrow
          style={{ marginTop: 20 }}
          onPress={() => setSheet(false)}
        />
        <Button
          label="None of these, let me type it"
          variant="ghost"
          style={{ marginTop: 8 }}
          onPress={() => setSheet(false)}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="monoLabel" style={{ color: colors.muted }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}
