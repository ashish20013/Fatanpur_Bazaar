import { useCallback } from 'react';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';

/**
 * "खरीदें" for a visitor who has not signed in yet.
 *
 * The shop is open to everyone (§A8.4 — browsing is never blocked), but the API's cart is not:
 * POST /cart/items answers 401 for a guest. Rather than let that surface as a red error on the
 * product the customer just chose, the first tap takes them to the phone-number screen, which
 * is what the website does at the same moment ("left keeps shopping, right goes on to login →
 * address → payment").
 */
export function useBuy(goToLogin: () => void): {
  buy: (productId: number, quantity?: number, slotDate?: string, slotStart?: string) => Promise<void>;
  setQuantity: (itemId: number, quantity: number) => Promise<void>;
  isGuest: boolean;
} {
  const { status } = useAuth();
  const { addItem, setQty } = useCart();
  const isGuest = status !== 'authenticated';

  const buy = useCallback(
    async (productId: number, quantity = 1, slotDate?: string, slotStart?: string): Promise<void> => {
      if (isGuest) {
        goToLogin();
        return;
      }
      await addItem(productId, quantity, slotDate, slotStart);
    },
    [isGuest, goToLogin, addItem],
  );

  const setQuantity = useCallback(
    async (itemId: number, quantity: number): Promise<void> => {
      if (isGuest) {
        goToLogin();
        return;
      }
      await setQty(itemId, quantity);
    },
    [isGuest, goToLogin, setQty],
  );

  return { buy, setQuantity, isGuest };
}
