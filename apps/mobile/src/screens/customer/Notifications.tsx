import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CustomerStackParamList } from '../../navigation/CustomerTabs';
import { api } from '../../services/api';
import { Skeleton } from '../../components/Skeleton';
import { colors, radius, space, type as t } from '../../theme/tokens';
import { hi } from '../../i18n/hi';

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}
interface NotificationsPage {
  rows: NotificationRow[];
  total: number;
  page: number;
  perPage: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return hi.notifications.justNow;
  if (min < 60) return hi.notifications.minutesAgo(min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return hi.notifications.hoursAgo(hr);
  const d = Math.floor(hr / 24);
  return hi.notifications.daysAgo(d);
}

/**
 * H2: Notifications screen — paginated list of user notifications with mark-read on tap.
 */
export default function NotificationsScreen({ navigation }: NativeStackScreenProps<CustomerStackParamList, 'Notifications'>): React.JSX.Element {
  const [data, setData] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const page = useRef(1);

  const load = useCallback(async (p: number, reset?: boolean) => {
    try {
      const res = await api.get<NotificationsPage>(`/notifications?page=${p}&perPage=20`);
      setData((prev) => (reset ? res.rows : [...prev, ...res.rows]));
      setHasMore(res.rows.length === res.perPage);
    } catch {
      // fail silently — empty list is fine
    }
  }, []);

  useEffect(() => {
    void load(1, true).finally(() => setLoading(false));
  }, [load]);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    page.current = 1;
    await load(1, true);
    setRefreshing(false);
  };

  const loadMore = (): void => {
    if (!hasMore) return;
    page.current += 1;
    void load(page.current);
  };

  const markRead = async (item: NotificationRow): Promise<void> => {
    if (!item.isRead) {
      setData((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      try {
        await api.post(`/notifications/${item.id}/read`, {});
      } catch {
        // best-effort
      }
    }
    if (item.linkUrl) {
      const match = item.linkUrl.match(/\/orders\/([A-Z0-9-]+)/);
      if (match) {
        navigation.navigate('OrderTracking', { orderNumber: match[1] });
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        {[1, 2, 3, 4].map((k) => (
          <Skeleton key={k} height={72} radius={radius.md} style={{ marginBottom: space[2] }} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[colors.g700]} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>{hi.notifications.empty}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={[styles.card, !item.isRead && styles.cardUnread]} onPress={() => void markRead(item)}>
          <View style={styles.row}>
            <Text style={[styles.title, !item.isRead && styles.titleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space[4], gap: space[2] },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardUnread: {
    borderColor: colors.g200,
    backgroundColor: colors.g50,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: t.sm,
    fontWeight: '600',
    color: colors.ink,
    flex: 1,
    marginRight: space[2],
  },
  titleUnread: { fontWeight: '700' },
  time: { fontSize: t.xs, color: colors.ink3 },
  body: { fontSize: t.sm, color: colors.ink2, lineHeight: 20 },
  empty: {
    alignItems: 'center',
    paddingTop: space[16],
  },
  emptyIcon: { fontSize: 48, marginBottom: space[3] },
  emptyText: { fontSize: t.base, color: colors.ink3 },
});
