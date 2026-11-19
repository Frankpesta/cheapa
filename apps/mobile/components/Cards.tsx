import { colors } from '@cheapa/config/tokens';
import { Pencil, Smartphone, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { dropPercent, formatNaira } from '../lib/format';
import { Icon } from './Icon';
import { Pill } from './Pills';
import { PressableScale } from './Pressable';
import { Thumb } from './Thumb';
import { Text } from './Text';

/**
 * Results summary (DESIGN.md §5 rule 5): lime "CHEAPEST NEW" and ink "USED FROM" side by
 * side. Never one "cheapest" across new and used. A missing side is left out.
 */
export function PriceSummaryCard({
  newPrice,
  usedPrice,
  onPressNew,
  onPressUsed,
}: {
  newPrice?: { kobo: number; note: string } | null;
  usedPrice?: { kobo: number; note: string } | null;
  onPressNew?: () => void;
  onPressUsed?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {newPrice ? (
        <SummaryTile
          label="CHEAPEST NEW"
          kobo={newPrice.kobo}
          note={newPrice.note}
          tone="lime"
          onPress={onPressNew}
        />
      ) : null}
      {usedPrice ? (
        <SummaryTile
          label="USED FROM"
          kobo={usedPrice.kobo}
          note={usedPrice.note}
          tone="ink"
          onPress={onPressUsed}
        />
      ) : null}
    </View>
  );
}

function SummaryTile({
  label,
  kobo,
  note,
  tone,
  onPress,
}: {
  label: string;
  kobo: number;
  note: string;
  tone: 'lime' | 'ink';
  onPress?: () => void;
}) {
  const lime = tone === 'lime';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label.toLowerCase()} ${formatNaira(kobo)}, ${note}`}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: lime ? colors.lime : colors.ink,
        borderRadius: 18,
        padding: 14,
        gap: 4,
      }}
    >
      <Text variant="monoLabel" style={{ color: lime ? colors.ink : colors.onInkFaint }}>
        {label}
      </Text>
      <Text variant="priceL" style={{ color: lime ? colors.ink : colors.ground }}>
        {formatNaira(kobo)}
      </Text>
      <Text
        variant={lime ? 'small' : 'smallRegular'}
        style={{ color: lime ? colors.ink : colors.onInkMuted }}
      >
        {note}
      </Text>
    </PressableScale>
  );
}

/** "LOOKS LIKE" card: thumb 54, Display name, detail line, "Not it?" link. */
export function DetectedCard({
  name,
  detail,
  imageUri,
  icon = Smartphone,
  onNotIt,
}: {
  name: string;
  detail?: string;
  imageUri?: string | null;
  icon?: LucideIcon;
  onNotIt?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 18,
        padding: 10,
      }}
    >
      <Thumb name={name} uri={imageUri} size={54} radius={14} icon={icon} iconSize={28} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="monoLabel" style={{ color: colors.muted }}>
          LOOKS LIKE
        </Text>
        <Text variant="priceM" numberOfLines={2}>
          {name}
        </Text>
        {detail ? (
          <Text variant="smallRegular" style={{ color: colors.body2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onNotIt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Not it? Correct the product"
          onPress={onNotIt}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 10,
            paddingHorizontal: 6,
            minHeight: 44,
          }}
        >
          <Icon as={Pencil} size={16} color={colors.green} />
          <Text variant="label" style={{ fontSize: 14, color: colors.green }}>
            Not it?
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Home "Real price drops" row: thumb 48, title, meta, price + drop badge. */
export function ProductRowCompact({
  title,
  meta,
  priceKobo,
  previousKobo,
  imageUri,
  icon,
  onPress,
}: {
  title: string;
  meta: string;
  priceKobo: number;
  /** The comparison price (30-day average) for the drop badge. */
  previousKobo?: number | null;
  imageUri?: string | null;
  icon?: LucideIcon;
  onPress?: () => void;
}) {
  const drop = previousKobo ? dropPercent(previousKobo, priceKobo) : null;
  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${formatNaira(priceKobo)}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        paddingVertical: 10,
        paddingLeft: 10,
        paddingRight: 12,
      }}
    >
      <Thumb name={title} uri={imageUri} size={48} {...(icon ? { icon } : {})} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Text variant="label" style={{ fontSize: 14, lineHeight: 18 }} numberOfLines={1}>
          {title}
        </Text>
        <Text
          variant="smallRegular"
          style={{ fontSize: 12, lineHeight: 16, color: colors.muted }}
          numberOfLines={1}
        >
          {meta}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text variant="priceS">{formatNaira(priceKobo)}</Text>
        {drop ? <Pill kind="drop" label={drop} /> : null}
      </View>
    </PressableScale>
  );
}
