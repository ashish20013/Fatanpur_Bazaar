import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errText } from '../../services/api';
import { useAdminAction } from '../../hooks/useAdminAction';
import { AdminScreen, Card, Check, Empty, Pill, Row } from '../../components/admin/AdminKit';

export interface CategoryRow {
  id: number; parent_id: number | null; vertical: string; item_type: 'PRODUCT' | 'SERVICE';
  name: string; name_hi: string | null; slug: string; image_url: string | null;
  icon: string | null; sort_order: number; is_active: 0 | 1;
  parent_name: string | null; product_count: number | string; child_count: number | string;
}

/**
 * Categories (GET /admin/categories). Switching one off removes it and its goods from the
 * shop everywhere at once — rail, home, search, sitemap — so it is the one control here.
 * Renaming, re-ordering and artwork stay on the website, where the tree is visible at a glance.
 */
export default function AdminCategoriesScreen(): React.JSX.Element {
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const { busy, err, ok, setErr, run } = useAdminAction();

  const load = useCallback(async () => {
    try { setRows(await api.get<CategoryRow[]>('/admin/categories')); }
    catch (e) { setErr(errText(e, true)); }
  }, [setErr]);

  useEffect(() => { void load(); }, [load]);

  /**
   * ⚠️ PUT /admin/categories/:id validates a WHOLE category (CategorySchema: name and vertical
   * are required). `{ isActive }` alone was a 422 and the switch did nothing, so the whole row
   * goes back with the one flag changed.
   */
  const setActive = (c: CategoryRow, next: boolean): void => {
    const body = {
      name: c.name,
      nameHi: c.name_hi ?? undefined,
      parentId: c.parent_id,
      vertical: c.vertical as 'VEGETABLES' | 'FRUITS' | 'GROCERY' | 'PHARMACY' | 'AGRI_INPUT' | 'SERVICE' | 'OTHER',
      itemType: c.item_type,
      sortOrder: c.sort_order,
      icon: c.icon ?? undefined,
      isActive: next,
    };
    void run(String(c.id), () => api.put(`/admin/categories/${c.id}`, body), next ? 'Category on' : 'Category off', () => void load());
  };

  return (
    <AdminScreen title="Categories" err={err} ok={ok} loading={rows === null}>
      {rows && rows.length === 0 ? <Empty text="No categories." /> : null}
      {rows?.map((c) => (
        <Card key={c.id}>
          <Row label="Category" value={c.name_hi ?? c.name} strong />
          {c.parent_name ? <Row label="Inside" value={c.parent_name} /> : null}
          <Row label="Vertical" value={<Pill text={c.vertical} tone="info" />} />
          <Row label="Type" value={c.item_type} />
          <Row label="Products" value={String(c.product_count)} />
          <Row label="Sub-categories" value={String(c.child_count)} />
          <Row label="Order" value={c.sort_order} />
          <Check
            label="Active (shown in the shop)"
            checked={c.is_active === 1}
            disabled={busy === String(c.id)}
            onChange={(n) => setActive(c, n)}
          />
        </Card>
      ))}
    </AdminScreen>
  );
}
