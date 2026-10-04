import { Injectable } from '@nestjs/common';
import { Log } from '../../common/logger';

export interface OrderPlacedEvent {
  userId: number;
  orderNumber: string;
  total: string;
  village: string | null;
}

/**
 * In-process event bus for post-commit realtime fan-out. The tracking gateway subscribes; orders
 * never import the gateway (keeps HTTP-only processes like the cron CLI free of Socket.IO).
 */
@Injectable()
export class OrderEvents {
  private placed: ((e: OrderPlacedEvent) => void)[] = [];
  private confirmed: ((orderNumber: string) => void)[] = [];
  onOrderPlaced(fn: (e: OrderPlacedEvent) => void): void {
    this.placed.push(fn);
  }
  orderPlaced(e: OrderPlacedEvent): void {
    for (const fn of this.placed) {
      try {
        fn(e);
      } catch (err) {
        Log.warn('events.listener_failed', { err: String(err) });
      }
    }
  }

  /**
   * An order reached CONFIRMED with no rider yet — the delivery module turns this into a pool
   * broadcast. Lives here (not a direct call) so the orders module never imports delivery, which
   * keeps the HTTP-only cron CLI free of the delivery/Socket.IO graph.
   */
  onOrderConfirmed(fn: (orderNumber: string) => void): void {
    this.confirmed.push(fn);
  }
  orderConfirmed(orderNumber: string): void {
    for (const fn of this.confirmed) {
      try {
        fn(orderNumber);
      } catch (err) {
        Log.warn('events.listener_failed', { err: String(err) });
      }
    }
  }
}
