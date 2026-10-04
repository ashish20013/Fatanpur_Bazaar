import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { colors, space, type as t } from '../theme/tokens';

/** Every list screen needs loading + empty + error states (§18) — this covers empty + error. */
export function EmptyState({
  icon = '🛒',
  title,
  help,
  actionLabel,
  onAction,
}: {
  icon?: string;
  title: string;
  help?: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return <EmptyState icon="⚠️" title={message} actionLabel="दोबारा कोशिश करें" onAction={onRetry} />;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: space[8], gap: space[2] },
  icon: { fontSize: 40 },
  title: { fontSize: t.md, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  help: { fontSize: t.sm, color: colors.ink3, textAlign: 'center' },
  action: { marginTop: space[4] },
});
