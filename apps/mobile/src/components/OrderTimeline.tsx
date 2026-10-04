import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ORDER_STATUS_LABEL_HI, TIMELINE, type OrderStatus, type OrderType } from '@fb/shared-types';
import { colors, space, type as t } from '../theme/tokens';

interface Step {
  status: OrderStatus;
  at: string | null;
  done: boolean;
}

/** Vertical timeline: the happy-path steps for this order type, with actual timestamps overlaid. */
export function OrderTimeline({
  orderType,
  currentStatus,
  history,
}: {
  orderType: OrderType;
  currentStatus: OrderStatus;
  history: { status: OrderStatus; labelHi: string; at: string }[];
}): React.JSX.Element {
  const happyPath = TIMELINE[orderType];
  const at = new Map(history.map((h) => [h.status, h.at]));
  const reachedIndex = happyPath.indexOf(currentStatus);
  const steps: Step[] = happyPath.map((status, i) => ({ status, at: at.get(status) ?? null, done: reachedIndex >= 0 ? i <= reachedIndex : Boolean(at.get(status)) }));
  const isNegativeTerminal = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED'].includes(currentStatus);

  return (
    <View>
      {steps.map((step, i) => (
        <View key={step.status} style={styles.row}>
          <View style={styles.railCol}>
            <View style={[styles.dot, step.done && styles.dotDone]} />
            {i < steps.length - 1 ? <View style={[styles.line, step.done && styles.lineDone]} /> : null}
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.label, step.done && styles.labelDone]}>{ORDER_STATUS_LABEL_HI[step.status]}</Text>
            {step.at ? <Text style={styles.time}>{new Date(step.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text> : null}
          </View>
        </View>
      ))}
      {isNegativeTerminal ? (
        <View style={styles.row}>
          <View style={styles.railCol}>
            <View style={[styles.dot, styles.dotDanger]} />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.label, styles.labelDanger]}>{ORDER_STATUS_LABEL_HI[currentStatus]}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  railCol: { width: 24, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.line, marginTop: 4 },
  dotDone: { backgroundColor: colors.g600 },
  dotDanger: { backgroundColor: colors.danger },
  line: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 2, minHeight: 20 },
  lineDone: { backgroundColor: colors.g200 },
  textCol: { flex: 1, paddingBottom: space[4] },
  label: { fontSize: t.base, color: colors.ink3, fontWeight: '600' },
  labelDone: { color: colors.ink },
  labelDanger: { color: colors.danger },
  time: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
});
