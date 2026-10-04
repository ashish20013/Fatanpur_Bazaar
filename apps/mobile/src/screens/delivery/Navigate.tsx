import React, { useEffect } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DeliveryStackParamList } from '../../navigation/DeliveryStack';
import { Button } from '../../components/Button';
import { colors, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

/** No maps SDK is bundled (§3/§9 — keep the app light for 2–4 GB phones): this just hands the
 * destination to whichever maps app the rider already has installed. */
export default function NavigateScreen({ route }: NativeStackScreenProps<DeliveryStackParamList, 'Navigate'>): React.JSX.Element {
  const { lat, lng, address } = route.params;

  const openMaps = (): void => {
    const url = lat !== null && lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    openMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.icon}>🧭</Text>
      <Text style={styles.address}>{address}</Text>
      <View style={{ height: space[4] }} />
      <Button label={hi.delivery.navigate} onPress={openMaps} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', padding: space[6] },
  icon: { fontSize: 48, marginBottom: space[4] },
  address: { fontSize: t.md, color: colors.ink2, textAlign: 'center' },
});
