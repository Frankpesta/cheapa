import { colors } from '@cheapa/config/tokens';
import type { Condition } from '@cheapa/core/client';
import { View } from 'react-native';
import { Text } from './Text';

export type PillKind = 'new' | 'used' | 'warn' | 'live' | 'premium' | 'drop';

const LOOK: Record<PillKind, { bg: string; fg: string }> = {
  new: { bg: colors.newBg, fg: colors.newFg },
  used: { bg: colors.usedBg, fg: colors.usedFg },
  warn: { bg: colors.dropBg, fg: colors.dropFg },
  live: { bg: colors.liveBg, fg: colors.liveFg },
  premium: { bg: colors.premiumBg, fg: colors.premiumFg },
  drop: { bg: colors.dropBg, fg: colors.dropFg },
};

/** 11/600, radius 6 (DESIGN.md §2 ConditionPill and flags). `drop` uses the mono face. */
export function Pill({ kind, label }: { kind: PillKind; label: string }) {
  const look = LOOK[kind];
  return (
    <View
      style={{
        backgroundColor: look.bg,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: kind === 'drop' ? 3 : 2,
      }}
    >
      <Text variant={kind === 'drop' ? 'mono' : 'pill'} style={{ color: look.fg }}>
        {label}
      </Text>
    </View>
  );
}

const CONDITION_LABEL: Record<Condition, string> = {
  new: 'New',
  used: 'Used',
  uk_used: 'UK used',
  refurbished: 'Refurbished',
  unknown: 'New',
};

/** Unknown condition shows as New: most fashion stores don't say (04 §4.5 headline rule). */
export function ConditionPill({ condition }: { condition: Condition }) {
  const used = condition === 'used' || condition === 'uk_used' || condition === 'refurbished';
  return <Pill kind={used ? 'used' : 'new'} label={CONDITION_LABEL[condition]} />;
}
