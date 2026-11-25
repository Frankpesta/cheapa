import { colors, tints } from '@cheapa/config/tokens';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ImageIcon, Search, X, Zap, ZapOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, PressableScale, Spinner, Text } from '../components';
import { useStartSearch } from '../lib/use-start-search';

type Mode = 'product' | 'shot';

const HINT: Record<Mode, string> = {
  product: 'Fill the frame with the product',
  shot: 'Pick a screenshot from your gallery',
};

/** Camera.dc.html: full-screen camera, Product / Screenshot mode, shutter = search. */
export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [mode, setMode] = useState<Mode>('product');
  const [flash, setFlash] = useState(false);
  const [shooting, setShooting] = useState(false);
  const start = useStartSearch();
  const busy = shooting || start.busy;

  const shoot = async () => {
    if (mode === 'shot') {
      await start.gallery({ replace: true });
      return;
    }
    if (!camera.current || busy) return;
    setShooting(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (photo) await start.image(photo, 'camera', { replace: true });
    } finally {
      setShooting(false);
    }
  };

  const granted = permission?.granted === true;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {granted ? (
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" flash={flash ? 'on' : 'off'} />
      ) : (
        <NoCamera canAsk={permission?.canAskAgain !== false} onAllow={() => void requestPermission()} />
      )}

      <LinearGradient
        pointerEvents="none"
        colors={[colors.shade, colors.shadeClear]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 150 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[colors.shadeClear, colors.shadeDeep]}
        locations={[0, 0.45]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 280 }}
      />

      <View
        style={{
          position: 'absolute',
          top: insets.top + 14,
          left: 20,
          right: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <RoundButton label="Close camera" icon={X} onPress={() => router.back()} />
        <View
          style={{
            flexDirection: 'row',
            gap: 4,
            backgroundColor: colors.scrim,
            padding: 4,
            borderRadius: 22,
          }}
        >
          <ModeButton label="Product" on={mode === 'product'} onPress={() => setMode('product')} />
          <ModeButton label="Screenshot" on={mode === 'shot'} onPress={() => setMode('shot')} />
        </View>
        <RoundButton
          label={flash ? 'Flash on' : 'Flash off'}
          icon={flash ? Zap : ZapOff}
          onPress={() => setFlash((f) => !f)}
        />
      </View>

      {granted ? (
        <>
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: insets.top + 116, left: 0, right: 0, alignItems: 'center' }}
          >
            <View
              style={{
                backgroundColor: colors.scrimStrong,
                borderRadius: 12,
                paddingVertical: 8,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }} />
              <Text variant="small" style={{ color: colors.card }}>
                {HINT[mode]}
              </Text>
            </View>
          </View>
          <Frame top={insets.top + 156} />
        </>
      ) : null}

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: Math.max(40, insets.bottom + 16),
          alignItems: 'center',
          gap: 22,
        }}
      >
        <View
          style={{ width: 300, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Pick from gallery"
            disabled={busy}
            onPress={() => void start.gallery({ replace: true })}
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: tints[0].bg,
              borderWidth: 2,
              borderColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon as={ImageIcon} color={tints[0].fg} />
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={mode === 'product' ? 'Take photo and search' : 'Pick a screenshot and search'}
            accessibilityState={{ busy, disabled: busy || (mode === 'product' && !granted) }}
            disabled={busy || (mode === 'product' && !granted)}
            onPress={() => void shoot()}
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              borderWidth: 4,
              borderColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 66,
                height: 66,
                borderRadius: 33,
                backgroundColor: colors.lime,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {busy ? <Spinner /> : <Icon as={Search} size={28} strokeWidth={2.2} />}
            </View>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Type instead"
            onPress={() => router.replace({ pathname: '/', params: { focus: '1' } })}
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.glass,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="priceS" style={{ fontSize: 17, color: colors.card }}>
              Aa
            </Text>
          </PressableScale>
        </View>
        <Text variant="smallRegular" style={{ color: colors.onInkMuted }}>
          Tip: include the brand name or box label if you can
        </Text>
      </View>
    </View>
  );
}

function RoundButton({ label, icon, onPress }: { label: string; icon: typeof X; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.scrim,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon as={icon} color={colors.card} />
    </PressableScale>
  );
}

function ModeButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      hitSlop={4}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: on ? colors.card : 'transparent',
      }}
    >
      <Text variant="label" style={{ fontSize: 13, color: on ? colors.ink : colors.onInkMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Lime corner brackets, 280×360, centred. */
function Frame({ top }: { top: number }) {
  const corner = { position: 'absolute', width: 38, height: 38, borderColor: colors.lime } as const;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top, alignSelf: 'center', width: 280, height: 360 }}
    >
      <View
        style={[corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 22 }]}
      />
      <View
        style={[
          corner,
          { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 22 },
        ]}
      />
      <View
        style={[
          corner,
          { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 22 },
        ]}
      />
      <View
        style={[
          corner,
          { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 22 },
        ]}
      />
    </View>
  );
}

/** No design for this state: composed from existing type and Button, flagged for review. */
function NoCamera({ canAsk, onAllow }: { canAsk: boolean; onAllow: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32, gap: 14 }}>
      <Text variant="displayS" style={{ color: colors.ground }}>
        Let Cheapa use your camera
      </Text>
      <Text variant="body" style={{ color: colors.onInkMuted }}>
        We use it only to photograph the product you want to price. Photos are never saved.
      </Text>
      {canAsk ? (
        <Button label="Allow camera" variant="primary-lime" onPress={onAllow} />
      ) : (
        <Text variant="small" style={{ color: colors.onInkMuted }}>
          Camera access is off for Cheapa. Turn it on in Settings, or pick a photo from your gallery below.
        </Text>
      )}
    </View>
  );
}
