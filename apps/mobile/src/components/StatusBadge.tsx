import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ORDER_STATUS_LABEL_HI, TERMINAL_STATUSES, SUCCESS_STATUSES, type OrderStatus } from '@fb/shared-types';
import { colors, radius, space, type as t } from '../theme/tokens';

function tone(status: OrderStatus): { bg: string; fg: string } {
  if (SUCCESS_STATUSES.includes(status)) return { bg: colors.g100, fg: colors.g700 };
  if (status === 'CANCELLED' || status === 'REJECTED' || status === 'PAYMENT_FAILED' || status === 'DELIVERY_FAILED') return { bg: '#fbe9e7', fg: colors.danger };
  if (TERMINAL_STATUSES.includes(status)) return { bg: colors.surface, fg: colors.ink2 };
  return { bg: colors.a100, fg: colors.a700 }; // in-progress
}

export function StatusBadge({ status }: { status: OrderStatus }): React.JSX.Element {
  const { bg, fg } = tone(status);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{ORDER_STATUS_LABEL_HI[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.full, alignSelf: 'flex-start' },
  text: { fontSize: t.xs, fontWeight: '600' },
});
