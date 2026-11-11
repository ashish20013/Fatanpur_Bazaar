import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, space, type as t } from '../theme/tokens';
import { useSite } from '../store/lang';
import { Icon } from './Icon';

/**
 * The site's bottom sheet (apps/web/src/components/Sheet.tsx): a titled panel that slides up
 * from the bottom with a scrim behind it. Tapping the scrim or the × closes it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const site = useSite();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={site.common.close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }]}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={site.common.close} style={styles.close}>
            <Icon name="x" size={20} color={colors.ink2} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(13,36,25,0.45)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space[5],
    paddingTop: space[4],
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], marginBottom: space[2] },
  title: { flex: 1, fontFamily: font.display, fontSize: t.lg, color: colors.ink, lineHeight: 24 },
  close: { height: 32, width: 32, alignItems: 'center', justifyContent: 'center' },
});
