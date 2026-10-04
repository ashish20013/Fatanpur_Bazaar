import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';
import { colors } from '../theme/tokens';

/** "1234.50" → "1,234.50" (Indian digit grouping: last 3, then groups of 2). Latin digits (§9). */
function groupIndian(intPart: string): string {
  const neg = intPart.startsWith('-');
  const s = neg ? intPart.slice(1) : intPart;
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped},${last3}`;
}

/** value is a MoneyString ("25.00") — never a float (BUILD_PROMPT §6). */
export function formatMoney(value: string, opts: { decimals?: boolean } = {}): string {
  const [intPartRaw, dec = '00'] = value.split('.');
  const intPart = groupIndian(intPartRaw || '0');
  const showDecimals = opts.decimals ?? dec !== '00';
  return showDecimals ? `₹${intPart}.${dec.padEnd(2, '0').slice(0, 2)}` : `₹${intPart}`;
}

export function Money({
  value,
  size = 16,
  weight = '700',
  color = colors.ink,
  strike = false,
  style,
}: {
  value: string;
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  strike?: boolean;
  style?: TextStyle;
}): React.JSX.Element {
  return (
    <Text style={[styles.text, { fontSize: size, fontWeight: weight, color, textDecorationLine: strike ? 'line-through' : 'none' }, style]}>
      {formatMoney(value)}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontVariant: ['tabular-nums'] },
});
