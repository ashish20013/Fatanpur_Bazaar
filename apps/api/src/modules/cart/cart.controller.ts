import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, MaybeUser, OptionalAuth, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import type { AuthUser } from '../../common/types';
import { CartService, validGuestKey, type CartOwner } from './cart.service';

const AddSchema = z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(1000), slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), slotStart: z.string().regex(/^\d{2}:\d{2}$/).optional() });

/** Owner = the verified user, else the X-Guest-Key uuid. Never a user id from the client. */
function owner(u: AuthUser | undefined, guestKey: string | undefined): CartOwner {
  if (u) return { userId: u.id };
  const g = validGuestKey(guestKey);
  if (!g) throw new AppError('UNAUTHENTICATED');
  return { guestKey: g };
}
/** "12:25.00,13:30.00" → {12:'25.00',13:'30.00'} (prices the client last showed). */
function parseKnown(s: string | undefined): Record<number, string> {
  const out: Record<number, string> = {};
  for (const part of (s ?? '').split(',').slice(0, 100)) {
    const [id, price] = part.split(':');
    if (/^\d+$/.test(id ?? '') && price) out[Number(id)] = price;
  }
  return out;
}

@Controller('cart')
@Public()
@OptionalAuth()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@MaybeUser() u: AuthUser | undefined, @Headers('x-guest-key') g: string | undefined, @Query('known') known: string | undefined): Promise<unknown> {
    return this.cart.view(owner(u, g), parseKnown(known));
  }
  @Post('items')
  add(@MaybeUser() u: AuthUser | undefined, @Headers('x-guest-key') g: string | undefined, @Body(new ZodPipe(AddSchema)) b: z.infer<typeof AddSchema>): Promise<unknown> {
    return this.cart.add(owner(u, g), b);
  }
  @Patch('items/:id')
  qty(@MaybeUser() u: AuthUser | undefined, @Headers('x-guest-key') g: string | undefined, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ quantity: z.number().int().min(0).max(1000) }))) b: { quantity: number }): Promise<unknown> {
    return this.cart.setQty(owner(u, g), id, b.quantity);
  }
  @Delete('items/:id')
  remove(@MaybeUser() u: AuthUser | undefined, @Headers('x-guest-key') g: string | undefined, @Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.cart.remove(owner(u, g), id);
  }
  @Delete()
  async clear(@MaybeUser() u: AuthUser | undefined, @Headers('x-guest-key') g: string | undefined): Promise<{ ok: true }> {
    await this.cart.clear(owner(u, g));
    return { ok: true };
  }
}

@Controller('cart')
export class CartMergeController {
  constructor(private readonly cart: CartService) {}
  @Post('merge')
  merge(@CurrentUser() u: AuthUser, @Headers('x-guest-key') g: string | undefined): Promise<unknown> {
    const key = validGuestKey(g);
    if (!key) return this.cart.view({ userId: u.id });
    return this.cart.merge(u.id, key);
  }
}
