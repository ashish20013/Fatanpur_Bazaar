import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout, radius, space, type as t } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: 40, md: layout.tapTarget, lg: 56 };
const FONT: Record<Size, number> = { sm: t.sm, md: t.base, lg: t.md };

/** One button component for the whole app — every state (loading/disabled) lives here once. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size], opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1 },
        fullWidth && styles.fullWidth,
        variantStyle(variant),
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.white : colors.g700} />
      ) : (
        <Text style={[styles.label, { fontSize: FONT[size] }, labelColor(variant)]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function variantStyle(v: Variant): ViewStyle {
  switch (v) {
    case 'primary':
      return { backgroundColor: colors.g700 };
    case 'danger':
      return { backgroundColor: colors.danger };
    case 'secondary':
      return { backgroundColor: colors.g50, borderWidth: 1, borderColor: colors.g200 };
    case 'ghost':
      return { backgroundColor: 'transparent' };
  }
}
function labelColor(v: Variant): { color: string } {
  return v === 'primary' || v === 'danger' ? { color: colors.white } : { color: colors.g700 };
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[4],
  },
  fullWidth: { alignSelf: 'stretch' },
  label: { fontWeight: '600' },
});
