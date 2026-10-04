import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Public, RateLimit } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { Log } from '../../common/logger';
import { clientIp, type AppRequest } from '../../common/types';
import { ENV, type Env } from '../../config/config.module';

/**
 * Browser errors, funnelled into the same file as the server's.
 *
 * Half of what goes wrong on this site goes wrong in a phone in a village: a script that throws on
 * an old Android WebView, a fetch that fails on 3G, a render that only breaks at 320 px. None of
 * that reaches the server's log, so a test session produced a file with a hole in exactly the half
 * the shopkeeper was testing.
 *
 * ⚠️ This endpoint writes to a file and takes anonymous input, which is a combination worth being
 * careful with. Four things keep it honest:
 *   • it is off unless CLIENT_ERROR_LOG is on, and that defaults to on only outside production;
 *   • it is rate limited per IP, so a script cannot fill the disk;
 *   • every field is length-capped by the schema, and the writer strips newlines, so nothing can
 *     forge extra entries in the file;
 *   • it records nothing the page did not already hand the browser — no cookies, no storage.
 */
const ClientErrorSchema = z.object({
  message: z.string().trim().min(1).max(300),
  source: z.string().trim().max(300).optional(),
  line: z.number().int().nonnegative().max(9_999_999).optional(),
  stack: z.string().trim().max(2000).optional(),
  url: z.string().trim().max(500).optional(),
  kind: z.enum(['error', 'unhandledrejection', 'resource']).default('error'),
});

@Controller()
@Public()
export class ClientLogController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Post('_client-error')
  @HttpCode(204)
  @RateLimit({ bucket: 'client:error:ip', by: 'ip', limit: 30, windowSec: 600 })
  report(@Body(new ZodPipe(ClientErrorSchema)) b: z.infer<typeof ClientErrorSchema>, @Req() req: AppRequest): void {
    if (!this.env.CLIENT_ERROR_LOG) return;
    Log.warn('browser.error', {
      kind: b.kind,
      message: b.message,
      page: b.url,
      at: b.source ? `${b.source}:${b.line ?? '?'}` : undefined,
      stack: b.stack,
      ua: String(req.headers['user-agent'] ?? '').slice(0, 200),
      ip: clientIp(req),
    });
  }
}
