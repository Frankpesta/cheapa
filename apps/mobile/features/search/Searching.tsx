import { colors } from '@cheapa/config/tokens';
import { Image } from 'expo-image';
import { Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconButton, ProgressChecklist, Text, type ChecklistStep } from '../../components';
import type { SearchInput } from '../../lib/search-session';

const SOURCE_LABEL = {
  camera: 'FROM CAMERA · 1 PHOTO',
  share: 'FROM SHARE · 1 IMAGE',
  gallery: 'FROM GALLERY · 1 IMAGE',
  link: 'FROM LINK',
  text: 'TYPED SEARCH',
} as const;

/**
 * Searching.dc.html while POST /search/* is in flight. The API answers in one response, so
 * the checklist walks the pipeline's phases on a timer and the last one stays active until
 * the answer lands. Per-store counts and the running cheapest need a streaming API
 * (BACKLOG), so those parts of the design are left out for now.
 */
export function Searching({
  input,
  thumb,
  onCancel,
}: {
  input: SearchInput;
  thumb?: string | undefined;
  onCancel: () => void;
}) {
  const phases =
    input.kind === 'image'
      ? ['Reading the photo', 'Finding the product', 'Checking stores', 'Sorting cheapest first']
      : ['Finding the product', 'Checking stores', 'Sorting cheapest first'];
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (active >= phases.length - 1) return;
    const t = setTimeout(() => setActive((a) => a + 1), 1300);
    return () => clearTimeout(t);
  }, [active, phases.length]);

  const steps: ChecklistStep[] = phases.map((label, i) => ({
    key: label,
    label,
    status: i < active ? 'done' : i === active ? 'active' : 'pending',
    ...(i === active ? { note: 'checking…' } : {}),
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1, paddingTop: 14, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginLeft: -10,
          }}
        >
          <IconButton icon={X} label="Cancel search" onPress={onCancel} />
          <Text variant="mono" style={{ fontSize: 12, color: colors.muted }}>
            {SOURCE_LABEL[input.source]}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end', marginTop: 12 }}>
          <Shot thumb={input.kind === 'image' ? thumb : undefined} />
          <View style={{ flex: 1, gap: 8, paddingBottom: 6 }}>
            <Text variant="monoLabel" style={{ fontSize: 11, color: colors.muted }}>
              {input.kind === 'image' ? 'LOOKING AT' : 'YOU TYPED'}
            </Text>
            <Text
              variant="displayS"
              style={{ fontSize: 26, lineHeight: 27.5, letterSpacing: -0.5 }}
              numberOfLines={3}
            >
              {input.kind === 'image' ? 'Your photo' : `“${input.query}”`}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 30 }}>
          <Text variant="displayS" accessibilityRole="header" style={{ marginBottom: 6 }}>
            Checking stores
          </Text>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: phases.length, now: active }}
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.line,
              overflow: 'hidden',
              marginBottom: 8,
            }}
          >
            <View
              style={{
                width: `${Math.round(((active + 0.5) / phases.length) * 100)}%`,
                height: '100%',
                borderRadius: 4,
                backgroundColor: colors.ink,
              }}
            />
          </View>
          <ProgressChecklist steps={steps} />
        </View>
      </View>
    </SafeAreaView>
  );
}

/** 132×196 card with the photo (or a search glyph for typed searches) and a lime scan line. */
function Shot({ thumb }: { thumb?: string | undefined }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(8);
  useEffect(() => {
    if (reduced) return;
    y.value = withRepeat(withTiming(180, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(y);
  }, [reduced, y]);
  const line = useAnimatedStyle(() => ({ top: y.value }));
  return (
    <View
      style={{
        width: 132,
        height: 196,
        borderRadius: 20,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        padding: 10,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 12,
          backgroundColor: colors.ground,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Icon as={Search} size={36} color={colors.muted} />
        )}
      </View>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            height: 3,
            backgroundColor: colors.lime,
            boxShadow: `0 0 14px ${colors.lime}`,
          },
          reduced ? { top: 8 } : line,
        ]}
      />
    </View>
  );
}
