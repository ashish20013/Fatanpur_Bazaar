import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { colors, font, radius, shadow1, space, type as t } from '../../theme/tokens';
import { Icon } from '../Icon';

/**
 * The staff panel's building blocks — the app half of apps/web/src/components/admin/
 * (`form-kit.tsx`, `table.tsx`).
 *
 * ⚠️ The staff side is in ENGLISH, deliberately: the shopkeeper's own rule, and the same rule
 * the website's StaffNav follows ("English only (owner's rule)"). Customer-facing screens stay
 * Hindi-first. Do not "translate" this panel.
 *
 * The website lays the panel out as a desktop table. A table does not survive a 360 px phone,
 * so the same data is shown as stacked rows — every column becomes a labelled line. The data,
 * the wording and the actions are the website's; only the shape changes.
 */

export function PanelTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title}>{children}</Text>
      {action}
    </View>
  );
}

/** One busy/error/success banner per screen — mirrors the website's `useAdminAction` state. */
export function Notice({ err, ok }: { err?: string | null; ok?: string | null }): React.JSX.Element | null {
  if (!err && !ok) return null;
  return (
    <View style={[styles.notice, err ? styles.noticeErr : styles.noticeOk]}>
      <Icon name={err ? 'alert-triangle' : 'circle-check'} size={16} color={err ? colors.danger : colors.ok} />
      <Text style={[styles.noticeText, { color: err ? colors.danger : colors.ok }]}>{err ?? ok}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A column of the website's table, as a labelled line on a phone. */
export function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.rowValue, strong && styles.rowValueStrong]} numberOfLines={2}>
          {value}
        </Text>
      ) : (
        <View style={styles.rowValueBox}>{value}</View>
      )}
    </View>
  );
}

export function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' | 'ok' | 'danger' }): React.JSX.Element {
  const colour = tone === 'warn' ? colors.warn : tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : colors.ink;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: colour }]}>{value}</Text>
    </View>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  editable = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address';
  multiline?: boolean;
  editable?: boolean;
}): React.JSX.Element {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.ink3}
      keyboardType={keyboardType}
      multiline={multiline}
      editable={editable}
      style={[styles.input, multiline && styles.inputMulti, !editable && styles.inputOff]}
    />
  );
}

export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): React.JSX.Element {
  return (
    <View style={styles.check}>
      <Text style={styles.checkLabel}>{label}</Text>
      <Switch value={checked} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.em500, false: colors.line2 }} />
    </View>
  );
}

export function Btn({
  label,
  onPress,
  tone = 'primary',
  busy,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  icon?: string;
}): React.JSX.Element {
  const off = Boolean(disabled || busy);
  return (
    <Pressable
      style={[styles.btn, tone === 'secondary' && styles.btnSecondary, tone === 'danger' && styles.btnDanger, off && styles.btnOff]}
      onPress={onPress}
      disabled={off}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tone === 'secondary' ? colors.em800 : colors.white} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={16} color={tone === 'secondary' ? colors.em800 : colors.white} /> : null}
          <Text style={[styles.btnText, tone === 'secondary' && styles.btnTextSecondary]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Pill({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'ok' | 'warn' | 'danger' | 'info' }): React.JSX.Element {
  const map = {
    muted: { bg: colors.paper2, fg: colors.ink2 },
    ok: { bg: colors.em100, fg: colors.ok },
    warn: { bg: colors.au100, fg: colors.au800 },
    danger: { bg: '#fdf0ee', fg: colors.danger },
    info: { bg: '#e6eff4', fg: colors.info },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]}>
      <Text style={[styles.pillText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

/** Standard screen frame: scrolls, holds the title, the banner and the content. */
export function AdminScreen({
  title,
  err,
  ok,
  loading,
  action,
  children,
}: {
  title: string;
  err?: string | null;
  ok?: string | null;
  loading?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenPad} keyboardShouldPersistTaps="handled">
      <PanelTitle action={action}>{title}</PanelTitle>
      <Notice err={err} ok={ok} />
      {loading ? <ActivityIndicator color={colors.em700} style={{ marginTop: space[6] }} /> : children}
    </ScrollView>
  );
}

export function Empty({ text }: { text: string }): React.JSX.Element {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  screenPad: { padding: space[4], paddingBottom: space[10], gap: space[3] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: { flex: 1, fontFamily: font.display, fontSize: t.xl, color: colors.ink },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], borderRadius: radius.sm, padding: space[3] },
  noticeErr: { backgroundColor: '#fdf0ee', borderWidth: 1, borderColor: '#f3c9c4' },
  noticeOk: { backgroundColor: colors.em100, borderWidth: 1, borderColor: colors.em200 },
  noticeText: { flex: 1, fontSize: t.base, fontFamily: font.bodySemi },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
    gap: space[2],
    ...shadow1,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
  rowLabel: { width: 118, fontSize: t.sm, color: colors.ink3 },
  rowValue: { flex: 1, fontSize: t.base, color: colors.ink },
  rowValueStrong: { fontFamily: font.bodySemi },
  rowValueBox: { flex: 1, alignItems: 'flex-start' },
  stat: {
    flexGrow: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[3],
  },
  statLabel: { fontSize: t.xs, color: colors.ink3, marginBottom: 2 },
  statValue: { fontSize: t.xxl, fontFamily: font.bodySemi },
  field: { gap: 4 },
  fieldLabel: { fontSize: t.sm, color: colors.ink2, fontFamily: font.bodySemi },
  fieldHint: { fontSize: t.xs, color: colors.ink3 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: space[3],
    fontSize: t.body,
    color: colors.ink,
  },
  inputMulti: { height: 110, paddingTop: space[2], textAlignVertical: 'top' },
  inputOff: { backgroundColor: colors.paper2, color: colors.ink3 },
  check: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingVertical: 2 },
  checkLabel: { flex: 1, fontSize: t.base, color: colors.ink },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
    backgroundColor: colors.em700,
  },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line2 },
  btnDanger: { backgroundColor: colors.danger },
  btnOff: { opacity: 0.55 },
  btnText: { color: colors.white, fontFamily: font.bodySemi, fontSize: t.base },
  btnTextSecondary: { color: colors.em800 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, alignSelf: 'flex-start' },
  pillText: { fontSize: t.xs, fontFamily: font.bodySemi },
  empty: { fontSize: t.base, color: colors.ink3, textAlign: 'center', paddingVertical: space[6] },
});
