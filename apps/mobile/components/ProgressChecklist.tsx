import { colors } from '@cheapa/config/tokens';
import { Check } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from './Icon';
import { ReceiptDivider } from './ReceiptDivider';
import { Text } from './Text';

export type StepStatus = 'done' | 'active' | 'pending';

export interface ChecklistStep {
  key: string;
  label: string;
  status: StepStatus;
  /** Right-hand mono note ("4 listings", "checking…"). */
  note?: string;
}

/** Searching store checklist: done (ink + lime check), active (spinner), pending (ring). */
export function ProgressChecklist({ steps }: { steps: readonly ChecklistStep[] }) {
  return (
    <View>
      {steps.map((s, i) => (
        <View key={s.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44 }}>
            <StatusMark status={s.status} />
            <Text
              variant="body"
              style={{ flex: 1, color: s.status === 'pending' ? colors.muted : colors.ink }}
              numberOfLines={1}
            >
              {s.label}
            </Text>
            {s.note ? (
              <Text variant="mono" style={{ fontSize: 12, color: colors.muted }}>
                {s.note}
              </Text>
            ) : null}
          </View>
          {i < steps.length - 1 ? <ReceiptDivider /> : null}
        </View>
      ))}
    </View>
  );
}

function StatusMark({ status }: { status: StepStatus }): ReactNode {
  if (status === 'done') {
    return (
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon as={Check} size={14} strokeWidth={3} color={colors.lime} />
      </View>
    );
  }
  if (status === 'active') return <Spinner />;
  return (
    <View
      style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.lineDashed }}
    />
  );
}

/** 0.9 s linear spin; still when the OS asks for reduced motion (DESIGN.md §2 Motion). */
export function Spinner({ size = 24 }: { size?: number }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Checking"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: colors.line,
          borderTopColor: colors.green,
        },
        spin,
      ]}
    />
  );
}
