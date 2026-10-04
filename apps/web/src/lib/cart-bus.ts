'use client';

import { useEffect, useState } from 'react';
import type { CartView } from '@fb/shared-types';

/**
 * Tiny in-page cart channel. Every cart mutation returns the fresh CartView from the API; we
 * broadcast it so the bottom bag bar and every "Buy" button update instantly, while
 * router.refresh() re-syncs the server components in the background. No client store library.
 */
type Listener = (c: CartView) => void;
const listeners = new Set<Listener>();
let last: CartView | null = null;

export function publishCart(c: CartView): void {
  last = c;
  for (const l of listeners) l(c);
}

export function useCart(initial: CartView | null): CartView | null {
  const [cart, setCart] = useState<CartView | null>(last ?? initial);
  useEffect(() => {
    // Server render is newer than a stale bus value after a full navigation.
    if (initial) last = initial;
    setCart(initial ?? last);
  }, [initial]);
  useEffect(() => {
    listeners.add(setCart);
    return () => {
      listeners.delete(setCart);
    };
  }, []);
  return cart;
}

export function useCartLine(productId: number, initial?: { itemId: number; quantity: number }): { itemId: number; quantity: number } | null {
  const [line, setLine] = useState(initial ?? null);
  useEffect(() => setLine(initial ?? null), [initial?.itemId, initial?.quantity]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const l: Listener = (c) => {
      const it = c.items.find((i) => i.productId === productId);
      setLine(it ? { itemId: it.id, quantity: it.quantity } : null);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [productId]);
  return line;
}
