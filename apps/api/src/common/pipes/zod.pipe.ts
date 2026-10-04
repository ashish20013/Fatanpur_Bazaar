import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../errors';

/**
 * Zod validation with whitelist semantics: z.object() strips unknown keys by default, so a
 * client-sent `role`, `userId`, `paid`, `price` etc. never reaches a controller (matrix §0 layer 2).
 * Use per-parameter: @Body(new ZodPipe(Schema)).
 */
@Injectable()
export class ZodPipe<S extends ZodTypeAny> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}
  transform(value: unknown): z.infer<S> {
    const r = this.schema.safeParse(value ?? {});
    if (r.success) return r.data;
    const first = r.error.issues[0];
    // Our schemas carry plain-Hindi messages ("पिन कोड 6 अंकों का…") — show that instead of the generic line.
    const custom = first && /[\u0900-\u097F]/.test(first.message) ? first.message : undefined;
    throw new AppError('VALIDATION_FAILED', {}, {
      hi: custom,
      field: first?.path.join('.') || undefined,
      data: { issues: r.error.issues.slice(0, 10).map((i) => ({ field: i.path.join('.'), message: i.message })) },
    });
  }
}
