import { colors, fonts } from '@cheapa/config/tokens';
import { ArrowRight, Search } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Icon, PressableScale } from '../components';

/** NotFound "What is it?" field: white, 52 tall, ink go-button with a lime arrow. */
export function QueryField({
  initial = '',
  onSubmit,
  autoFocus = false,
}: {
  initial?: string;
  onSubmit: (query: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const ready = value.trim().length >= 2;
  return (
    <View
      style={{
        height: 52,
        borderRadius: 14,
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: colors.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 14,
        paddingRight: 6,
      }}
    >
      <Icon as={Search} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={() => ready && onSubmit(value.trim())}
        autoFocus={autoFocus}
        returnKeyType="search"
        accessibilityLabel="Product name"
        placeholder="Brand and model, or describe it"
        placeholderTextColor={colors.mutedSoft}
        style={{ flex: 1, height: '100%', fontFamily: fonts.sans, fontSize: 15, color: colors.ink }}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Search"
        accessibilityState={{ disabled: !ready }}
        disabled={!ready}
        onPress={() => onSubmit(value.trim())}
        hitSlop={2}
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: ready ? 1 : 0.5,
        }}
      >
        <Icon as={ArrowRight} size={18} strokeWidth={2.2} color={colors.lime} />
      </PressableScale>
    </View>
  );
}
