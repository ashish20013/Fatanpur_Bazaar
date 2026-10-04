import React from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { colors, layout, radius, space, type as t } from '../theme/tokens';

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  required,
  keyboardType = 'default',
  maxLength,
  multiline = false,
  editable = true,
  autoFocus = false,
  secureTextEntry = false,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  multiline?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
        autoFocus={autoFocus}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.multiline, Boolean(error) && styles.inputError, !editable && styles.disabled]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space[4] },
  label: { fontSize: t.sm, fontWeight: '600', color: colors.ink2, marginBottom: space[1] },
  required: { color: colors.danger },
  input: {
    minHeight: layout.tapTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    fontSize: t.md,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: space[3] },
  inputError: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.surface, color: colors.ink3 },
  error: { fontSize: t.xs, color: colors.danger, marginTop: space[1] },
});
