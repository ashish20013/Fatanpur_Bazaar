import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CartView } from '@fb/shared-types';
import { api } from '../services/api';
import { useAuth } from './auth';

interface CartContextValue {
  cart: CartView | null;
  loading: boolean;
  itemCount: number;
  refresh: () => Promise<void>;
  addItem: (productId: number, quantity: number) => Promise<void>;
  setQty: (itemId: number, quantity: number) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Cart is server-side and identical for web/mobile (A11) — this context is a thin cache
 * over GET/POST/PATCH /cart so screens don't each re-fetch and re-derive totals. */
export function CartProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    try {
      const v = await api.get<CartView>('/cart');
      setCart(v);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const addItem = useCallback(
    async (productId: number, quantity: number) => {
      const v = await api.post<CartView>('/cart/items', { productId, quantity });
      setCart(v);
    },
    [],
  );

  const setQty = useCallback(async (itemId: number, quantity: number) => {
    const v = await api.patch<CartView>(`/cart/items/${itemId}`, { quantity });
    setCart(v);
  }, []);

  const removeItem = useCallback(async (itemId: number) => {
    const v = await api.delete<CartView>(`/cart/items/${itemId}`);
    setCart(v);
  }, []);

  const clear = useCallback(async () => {
    await api.delete('/cart');
    setCart(null);
    await refresh();
  }, [refresh]);

  const itemCount = cart?.itemCount ?? 0;

  const value = useMemo<CartContextValue>(
    () => ({ cart, loading, itemCount, refresh, addItem, setQty, removeItem, clear }),
    [cart, loading, itemCount, refresh, addItem, setQty, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
