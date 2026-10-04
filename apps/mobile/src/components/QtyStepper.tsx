import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, type as t } from '../theme/tokens';

/** 48dp tap targets on the +/- buttons per §9 (rural users, imprecise taps on cheap glass). */
export function QtyStepper({ quantity, onChange, min = 0, max = 1000 }: { quantity: number; onChange: (q: number) => void; min?: number; max?: number }): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="कम करें"
        onPress={() => onChange(Math.max(min, quantity - 1))}
        style={styles.btn}
        hitSlop={8}
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
      <Text style={styles.qty}>{quantity}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="बढ़ाएं"
        onPress={() => onChange(Math.min(max, quantity + 1))}
        style={styles.btn}
        hitSlop={8}
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
    </View>
  );
}

const SIZE = 32;
const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.g50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.g200 },
  btn: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  sign: { fontSize: t.lg, fontWeight: '700', color: colors.g700 },
  qty: { minWidth: 28, textAlign: 'center', fontSize: t.md, fontWeight: '700', color: colors.ink },
});
