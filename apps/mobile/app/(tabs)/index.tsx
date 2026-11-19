import { colors, fonts } from '@cheapa/config/tokens';
import type { SearchHistoryItem } from '@cheapa/core/client';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Camera, ImageIcon, Search, User } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { Icon, PressableScale, Text, Thumb } from '../../components';
import { api } from '../../lib/api';
import { formatNaira } from '../../lib/format';
import { useStartSearch } from '../../lib/use-start-search';

/** Home.dc.html: greeting, Snap hero, type-it field, Recent. */
export default function Home() {
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const start = useStartSearch();
  const [query, setQuery] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const recent = useQuery({ queryKey: ['searches', 'recent'], queryFn: () => api.searches() });

  // Camera's "Aa" lands here with focus=1.
  useEffect(() => {
    if (focus) input.current?.focus();
  }, [focus]);

  const recentItems = (recent.data?.items ?? []).filter((i) => i.topProduct).slice(0, 3);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
            {greeting(new Date())}
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => router.navigate('/settings')}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon as={User} size={20} color={colors.lime} />
          </PressableScale>
        </View>

        <Hero
          onSnap={() => router.push('/camera')}
          onGallery={() => void start.gallery()}
          busy={start.busy}
        />

        <View
          style={{
            height: 52,
            borderRadius: 16,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
          }}
        >
          <Icon as={Search} color={colors.mutedSoft} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => start.text(query)}
            returnKeyType="search"
            placeholder={'Or type it: "iPhone 15 Pro 256GB"'}
            placeholderTextColor={colors.mutedSoft}
            accessibilityLabel="Search by name"
            style={{ flex: 1, height: '100%', fontFamily: fonts.sans, fontSize: 15, color: colors.ink }}
          />
        </View>

        {recentItems.length ? <Recent items={recentItems} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Hero({ onSnap, onGallery, busy }: { onSnap: () => void; onGallery: () => void; busy: boolean }) {
  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: 26, padding: 22, gap: 16, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          right: -40,
          top: -40,
          width: 170,
          height: 170,
          borderRadius: 85,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.inkLine,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 18,
          top: 18,
          width: 64,
          height: 64,
          borderRadius: 18,
          backgroundColor: colors.inkSoft,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '8deg' }],
        }}
      >
        <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.lime} strokeWidth={2}>
          <Path d="M3 12V4h8l10 10-8 8z" strokeLinejoin="round" />
          <Circle cx={7.5} cy={8.5} r={1.2} />
        </Svg>
      </View>
      <Text
        variant="displayM"
        accessibilityRole="header"
        style={{ color: colors.ground, fontSize: 30, lineHeight: 31.5, letterSpacing: -0.8, maxWidth: 220 }}
      >
        Wetin you wan buy? Snap am.
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <PressableScale
          accessibilityRole="button"
          onPress={onSnap}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            backgroundColor: colors.lime,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon as={Camera} />
          <Text variant="button">Snap a product</Text>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Pick from gallery"
          accessibilityState={{ busy }}
          disabled={busy}
          onPress={onGallery}
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.inkLine2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon as={ImageIcon} color={colors.ground} />
        </PressableScale>
      </View>
    </View>
  );
}

function Recent({ items }: { items: SearchHistoryItem[] }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="heading" accessibilityRole="header">
          Recent
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/history')}
          style={{ paddingVertical: 8, minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="small" style={{ fontSize: 14, color: colors.green }}>
            See all
          </Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {items.map((item) => {
          const top = item.topProduct!;
          const price = top.cheapestNewKobo ?? top.cheapestUsedKobo;
          return (
            <PressableScale
              key={item.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: top.slug } })}
              style={{ width: 108, gap: 6 }}
            >
              <Thumb
                name={top.title}
                uri={top.repImageUrl}
                size={108}
                radius={14}
                height={76}
                iconSize={30}
              />
              <Text variant="label" style={{ fontSize: 12, lineHeight: 15.6 }} numberOfLines={2}>
                {top.title}
              </Text>
              {price != null ? (
                <Text
                  variant="priceS"
                  style={{ fontSize: 13, lineHeight: 16, fontFamily: fonts.displayBold, color: colors.green }}
                >
                  {top.cheapestNewKobo != null ? 'from' : 'used from'} {formatNaira(price)}
                </Text>
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
