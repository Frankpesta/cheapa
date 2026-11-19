import { colors } from '@cheapa/config/tokens';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';

/** White, radius 18 group of 52-tall rows with `track` dividers (Profile). */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<SettingsItemProps>[];
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 18,
        paddingHorizontal: 14,
      }}
    >
      {items.map((item, i) => (
        <View
          key={item.key ?? i}
          style={i < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.track } : null}
        >
          {item}
        </View>
      ))}
    </View>
  );
}

export interface SettingsItemProps {
  label: string;
  value?: string;
  icon?: LucideIcon;
  /** Right-hand control (a Toggle); replaces value and chevron. */
  accessory?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
}

export function SettingsItem({ label, value, icon, accessory, chevron = false, onPress }: SettingsItemProps) {
  return (
    <Pressable
      accessibilityRole={accessory ? undefined : 'button'}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 }}
    >
      {icon ? <Icon as={icon} /> : null}
      <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {accessory ?? (
        <>
          {value ? (
            <Text variant="body" style={{ fontSize: 14, color: colors.muted }}>
              {value}
            </Text>
          ) : null}
          {chevron ? <Icon as={ChevronRight} size={18} color={colors.muted} /> : null}
        </>
      )}
    </Pressable>
  );
}
