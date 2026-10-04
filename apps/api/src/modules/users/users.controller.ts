import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import type { AuthUser } from '../../common/types';
import { UsersService, type AddressInput } from './users.service';

/** NOTE: no `role` key — z.object strips it, so PATCH /users/me {role:'ADMIN'} is a no-op (matrix §0). */
const ProfileSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), email: z.string().email().max(160).nullable().optional(), language: z.enum(['hi', 'en']).optional() });
const AddressSchema = z
  .object({
    label: z.string().trim().max(40).optional(),
    receiverName: z.string().trim().min(1, 'नाम लिखें').max(120),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'मोबाइल नंबर 10 अंकों का होना चाहिए'),
    line1: z.string().trim().min(3, 'घर / मोहल्ला लिखें').max(255),
    landmark: z.string().trim().max(255).nullable().optional(),
    // The customer picks from the shop's own list — there is no free-text area any more.
    villageId: z.number().int().positive({ message: 'अपना गाँव चुनें' }),
    areaText: z.string().trim().max(200).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    accuracyM: z.number().min(0).max(100000).nullable().optional(),
    isDefault: z.boolean().optional(),
    // migration 003 — rural details (optional at the API so older app builds keep working;
    // the website makes guardian name + location compulsory in the form)
    guardianName: z.string().trim().max(120).nullable().optional(),
    altPhone: z.string().trim().regex(/^[6-9]\d{9}$/, 'दूसरा मोबाइल नंबर 10 अंकों का होना चाहिए').nullable().optional().or(z.literal('')),
    district: z.string().trim().max(80).nullable().optional(),
    pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'पिन कोड 6 अंकों का होना चाहिए').nullable().optional().or(z.literal('')),
    directions: z.string().trim().max(500).nullable().optional(),
    deliveryNote: z.string().trim().max(300).nullable().optional(),
    locationMethod: z.enum(['GPS', 'MAP_PIN', 'DESCRIBED']).nullable().optional(),
    // migration 005 — the phone's own position and the "are you there?" answer
    originLat: z.number().min(-90).max(90).nullable().optional(),
    originLng: z.number().min(-180).max(180).nullable().optional(),
    originAccuracyM: z.number().min(0).max(100000).nullable().optional(),
    orderedFromHere: z.boolean().nullable().optional(),
  });

@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.users.profile(u.id);
  }
  @Patch()
  update(@CurrentUser() u: AuthUser, @Body(new ZodPipe(ProfileSchema)) b: z.infer<typeof ProfileSchema>): Promise<unknown> {
    return this.users.updateProfile(u.id, b);
  }
  @Get('addresses')
  addresses(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.users.addresses(u.id);
  }
  @Post('addresses')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(AddressSchema)) b: AddressInput): Promise<unknown> {
    return this.users.saveAddress(u.id, null, b);
  }
  @Put('addresses/:id')
  save(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(AddressSchema)) b: AddressInput): Promise<unknown> {
    return this.users.saveAddress(u.id, id, b);
  }
  @Delete('addresses/:id')
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    await this.users.deleteAddress(u.id, id);
    return { ok: true };
  }
}
