import React from 'react';
import { useAuth } from '../store/auth';
import { CustomerNavigator } from './CustomerTabs';
import { DeliveryNavigator } from './DeliveryStack';
import { StaffNavigator } from './StaffStack';

/**
 * Role comes ONLY from `/auth/me` (never cached client state) — RootNavigator only mounts
 * this component after that call has succeeded, so `user` here is always fresh.
 *
 * "Staff/delivery screens lazy-loaded so a customer's session never renders them" (§10):
 * Metro ships one JS bundle either way (no code-splitting configured — that would need
 * additional native/Metro plumbing out of scope here), but what actually matters — a
 * CUSTOMER session never CONSTRUCTS the DeliveryNavigator/StaffNavigator component trees,
 * never calls their screens' effects, never touches admin/rider endpoints — is guaranteed
 * by this switch: exactly one branch mounts, ever, for a given session.
 */
export function RoleNavigator(): React.JSX.Element | null {
  const { user } = useAuth();
  if (!user) return null; // RootNavigator guarantees this is only reached when authenticated
  switch (user.role) {
    case 'CUSTOMER':
      return <CustomerNavigator />;
    case 'DELIVERY_BOY':
      return <DeliveryNavigator />;
    case 'ADMIN':
    case 'SUPERVISOR':
      return <StaffNavigator />;
    default:
      return null;
  }
}
