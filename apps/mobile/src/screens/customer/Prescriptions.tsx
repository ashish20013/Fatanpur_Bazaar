import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PrescriptionStatus } from '@fb/shared-types';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api, ApiError } from '../../services/api';
import { Button } from '../../components/Button';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ListRowSkeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

const MAX_BYTES = 5 * 1024 * 1024;

interface RxRow {
  id: number;
  status: PrescriptionStatus;
  reviewNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  orderId: number | null;
}

/** A21 (client half): camera or a PDF file, size-checked before upload, status shown in Hindi. */
export default function PrescriptionsScreen(_props: NativeStackScreenProps<CustomerStackParamList, 'Prescriptions'>): React.JSX.Element {
  const [rows, setRows] = useState<RxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.get<RxRow[]>('/prescriptions'));
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: { uri: string; type: string; name: string; size?: number | null }): Promise<void> => {
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      setError(hi.prescriptions.tooLarge);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      // React Native's FormData file shape ({uri,type,name}) — not the DOM File type TS expects.
      form.append('file', { uri: file.uri, type: file.type, name: file.name } as unknown as Blob);
      await api.upload('/prescriptions', form);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageHi : hi.common.somethingWrong);
    } finally {
      setUploading(false);
    }
  };

  const fromCamera = async (): Promise<void> => {
    const res = await launchCamera({ mediaType: 'photo', quality: 0.85, saveToPhotos: false });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    await upload({ uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'parchi.jpg', size: asset.fileSize });
  };

  const fromFile = async (): Promise<void> => {
    try {
      const [file] = await DocumentPicker.pick({ type: [DocumentPicker.types.pdf, DocumentPicker.types.images] });
      if (!file?.uri) return;
      await upload({ uri: file.uri, type: file.type ?? 'application/pdf', name: file.name ?? 'parchi.pdf', size: file.size });
    } catch {
      // user cancelled the picker — not an error worth showing
    }
  };

  if (error && rows === null) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <View style={styles.uploadRow}>
        <View style={{ flex: 1 }}>
          <Button label={hi.prescriptions.choosePhoto} onPress={() => void fromCamera()} loading={uploading} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={hi.prescriptions.chooseFile} onPress={() => void fromFile()} loading={uploading} variant="secondary" />
        </View>
      </View>
      {uploading ? <Text style={styles.uploadingText}>{hi.prescriptions.uploading}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {rows === null ? (
        <FlatList data={[1, 2, 3]} keyExtractor={(i) => String(i)} renderItem={() => <ListRowSkeleton />} />
      ) : rows.length === 0 ? (
        <EmptyState icon="💊" title={hi.prescriptions.empty} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: space[4], gap: space[2] }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rxTitle}>पर्ची #{item.id}</Text>
                <Text style={styles.rxDate}>{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                {item.reviewNote ? <Text style={styles.rxNote}>{item.reviewNote}</Text> : null}
              </View>
              <View style={[styles.badge, badgeStyle(item.status)]}>
                <Text style={[styles.badgeText, badgeTextStyle(item.status)]}>{hi.prescriptions.status[item.status as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'] ?? item.status}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function badgeStyle(s: PrescriptionStatus): { backgroundColor: string } {
  if (s === 'APPROVED') return { backgroundColor: colors.g100 };
  if (s === 'REJECTED') return { backgroundColor: '#fbe9e7' };
  return { backgroundColor: colors.a100 };
}
function badgeTextStyle(s: PrescriptionStatus): { color: string } {
  if (s === 'APPROVED') return { color: colors.g700 };
  if (s === 'REJECTED') return { color: colors.danger };
  return { color: colors.a700 };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  uploadRow: { flexDirection: 'row', gap: space[2], padding: space[4] },
  uploadingText: { textAlign: 'center', color: colors.ink3, fontSize: t.sm, marginBottom: space[2] },
  errorText: { textAlign: 'center', color: colors.danger, fontSize: t.sm, marginBottom: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: space[3] },
  rxTitle: { fontSize: t.base, fontWeight: '700', color: colors.ink },
  rxDate: { fontSize: t.xs, color: colors.ink3, marginTop: 2 },
  rxNote: { fontSize: t.xs, color: colors.ink2, marginTop: 4 },
  badge: { paddingHorizontal: space[3], paddingVertical: space[1], borderRadius: radius.full },
  badgeText: { fontSize: t.xs, fontWeight: '600' },
});
