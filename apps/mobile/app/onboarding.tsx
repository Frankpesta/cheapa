import { colors, tints } from '@cheapa/config/tokens';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, IconButton, LogoMark, Text } from '../components';
import { setPrefs } from '../lib/prefs';

/** Welcome.dc.html then Onboarding2.dc.html. No city step: Cheapa doesn't deliver. */
export default function Onboarding() {
  const [step, setStep] = useState<1 | 2>(1);
  const finish = () => {
    setPrefs({ onboarded: true });
    router.replace('/');
  };
  return step === 1 ? (
    <Welcome onNext={() => setStep(2)} />
  ) : (
    <ShareStep onBack={() => setStep(1)} onDone={finish} />
  );
}

function Dots({ step, dark }: { step: 1 | 2; dark: boolean }) {
  const on = dark ? colors.lime : colors.ink;
  const off = dark ? colors.inkLine2 : colors.handle;
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step} of 2`}>
      <View
        style={{
          width: step === 1 ? 24 : 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: step === 1 ? on : off,
        }}
      />
      <View
        style={{
          width: step === 2 ? 24 : 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: step === 2 ? on : off,
        }}
      />
    </View>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 }}>
          <LogoMark size={30} />
          <Text
            variant="displayS"
            style={{ fontSize: 24, lineHeight: 28, letterSpacing: -0.5, color: colors.ground }}
          >
            cheapa
          </Text>
        </View>

        <View
          style={{ flex: 1, minHeight: 300 }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={{
              position: 'absolute',
              width: 300,
              height: 300,
              borderRadius: 150,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.inkLine,
              top: '50%',
              left: '50%',
              marginTop: -150,
              marginLeft: -150,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 8,
              top: 64,
              width: 150,
              height: 196,
              borderRadius: 22,
              backgroundColor: colors.inkSoft,
              borderWidth: 1,
              borderColor: colors.inkLine,
              padding: 14,
              gap: 10,
              transform: [{ rotate: '-8deg' }],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.inkLine2 }} />
              <View style={{ width: 54, height: 6, borderRadius: 3, backgroundColor: colors.inkLine2 }} />
            </View>
            <View
              style={{
                flex: 1,
                borderRadius: 12,
                backgroundColor: colors.inkLine,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon as={Smartphone} size={44} color={colors.onInkFaint} />
            </View>
            <Text variant="mono" style={{ fontSize: 10, color: colors.onInkFaint }}>
              DM for price
            </Text>
          </View>
          <View
            style={{
              position: 'absolute',
              right: 0,
              top: 142,
              width: 236,
              borderRadius: 22,
              backgroundColor: colors.ground,
              padding: 16,
              gap: 8,
              boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            }}
          >
            <Text variant="monoLabel" style={{ color: colors.muted }}>
              5 STORES CHECKED
            </Text>
            <PriceLine store="Slot" price="₦318,500" best />
            <PriceLine store="Jumia" price="₦324,900" />
            <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.lineDashed }}>
              <PriceLine store="Konga" price="₦331,000" />
            </View>
          </View>
        </View>

        <View style={{ gap: 14 }}>
          <Text variant="displayXL" accessibilityRole="header" style={{ color: colors.ground }}>
            Snap am.{'\n'}See who sell am{' '}
            <Text variant="displayXL" style={{ color: colors.lime }}>
              cheapest.
            </Text>
          </Text>
          <Text variant="body" style={{ fontSize: 16, lineHeight: 24, color: colors.onInkMuted }}>
            Photo any product, or share a screenshot. We check Nigerian stores and show you the lowest price.
          </Text>
        </View>
        <View style={{ marginTop: 28, marginBottom: 20 }}>
          <Dots step={1} dark />
        </View>
        <Button label="Get started" variant="primary-lime" size="lg" trailingArrow onPress={onNext} />
      </View>
    </SafeAreaView>
  );
}

/** Sample illustration only: these are the design file's example prices, not live data. */
function PriceLine({ store, price, best = false }: { store: string; price: string; best?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: best ? 10 : 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: best ? colors.lime : 'transparent',
      }}
    >
      <Text
        variant={best ? 'label' : 'smallRegular'}
        style={best ? { fontSize: 13 } : { color: colors.body2 }}
      >
        {store}
      </Text>
      <Text variant={best ? 'priceM' : 'priceS'} style={best ? undefined : { fontSize: 15 }}>
        {price}
      </Text>
    </View>
  );
}

function ShareStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 24, paddingBottom: 24 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginLeft: -10,
          }}
        >
          <IconButton icon={ArrowLeft} label="Back" onPress={onBack} />
          <Pressable
            accessibilityRole="button"
            onPress={onDone}
            style={{ paddingVertical: 12, paddingHorizontal: 4 }}
          >
            <Text variant="bodyMedium" style={{ color: colors.muted }}>
              Skip
            </Text>
          </Pressable>
        </View>

        <View
          style={{ flex: 1, minHeight: 360, marginTop: 8, alignItems: 'center' }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={{
              position: 'absolute',
              top: 0,
              width: 250,
              height: 330,
              borderRadius: 28,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: tints[1].bg }} />
              <View style={{ gap: 2 }}>
                <Text variant="label" style={{ fontSize: 12, lineHeight: 15 }}>
                  gadgetplug.ng
                </Text>
                <Text variant="caption" style={{ fontSize: 10, color: colors.muted }}>
                  Ikeja, Lagos
                </Text>
              </View>
            </View>
            <View
              style={{
                height: 168,
                borderRadius: 16,
                backgroundColor: colors.track,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon as={Smartphone} size={64} />
              <View
                style={{
                  position: 'absolute',
                  left: 10,
                  bottom: 10,
                  backgroundColor: colors.ink,
                  borderRadius: 8,
                  paddingVertical: 5,
                  paddingHorizontal: 9,
                }}
              >
                <Text variant="priceS" style={{ fontSize: 13, lineHeight: 16, color: colors.card }}>
                  Camon 30 · DM 4 price
                </Text>
              </View>
            </View>
            <View style={{ height: 6, width: '80%', borderRadius: 3, backgroundColor: colors.line }} />
            <View style={{ height: 6, width: '55%', borderRadius: 3, backgroundColor: colors.line }} />
          </View>

          <View
            style={{
              position: 'absolute',
              top: 236,
              width: 342,
              maxWidth: '100%',
              borderRadius: 26,
              backgroundColor: colors.card,
              padding: 18,
              paddingBottom: 20,
              boxShadow: `0 -2px 0 ${colors.line}, 0 24px 60px rgba(14,26,19,0.18)`,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.lineDashed,
                alignSelf: 'center',
                marginBottom: 14,
              }}
            />
            <Text variant="small" style={{ color: colors.muted, marginBottom: 12 }}>
              Share to
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: colors.ink,
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 0 3px ${colors.lime}`,
                  }}
                >
                  <LogoMark size={40} tone="ink" />
                </View>
                <Text variant="pill">Cheapa</Text>
              </View>
              {['Messages', 'Notes', 'More'].map((app) => (
                <View key={app} style={{ alignItems: 'center', gap: 6, width: 64 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 15, backgroundColor: colors.line }} />
                  <Text variant="caption" style={{ color: colors.muted }}>
                    {app}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: 14 }}>
          <Text variant="displayL" accessibilityRole="header" style={{ fontSize: 36, lineHeight: 38 }}>
            Saw it online?{'\n'}Share it to Cheapa.
          </Text>
          <Text variant="body" style={{ fontSize: 16, lineHeight: 24, color: colors.body2 }}>
            Vendor won't post the price? Screenshot the post, tap Share, pick Cheapa. We find the same item
            across stores.
          </Text>
        </View>
        <View style={{ marginTop: 26, marginBottom: 20 }}>
          <Dots step={2} dark={false} />
        </View>
        <Button label="Get started" size="lg" trailingArrow onPress={onDone} />
      </View>
    </SafeAreaView>
  );
}
