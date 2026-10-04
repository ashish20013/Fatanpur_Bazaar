import { Controller, Get, Inject, Optional } from '@nestjs/common';
import type { Knex } from 'knex';
import { Public } from '../../common/decorators';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { TrackingGateway } from '../tracking/tracking.gateway';

const startedAt = Date.now();

/** UptimeRobot target. Reports the socket transport actually in use (LIVE_TRACKING §7). */
@Controller()
@Public()
export class HealthController {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    @Optional() private readonly gateway?: TrackingGateway,
  ) {}

  @Get('health')
  async health(): Promise<unknown> {
    let db = 'up';
    try {
      await this.db.raw('SELECT 1');
    } catch {
      db = 'down';
    }
    const s = this.gateway?.stats() ?? { activeSockets: 0, transports: {} };
    const transport = Object.entries(s.transports).sort((a, b) => b[1] - a[1])[0]?.[0] ?? this.env.SOCKET_TRANSPORTS[0];
    return {
      status: db === 'up' ? 'up' : 'degraded',
      db,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      activeSockets: s.activeSockets,
      socketTransport: transport,
      socketTransports: s.transports,
      version: process.env.npm_package_version ?? '1.0.0',
      commit: this.env.GIT_COMMIT,
    };
  }

  @Get('version')
  version(): { version: string; commit: string } {
    return { version: process.env.npm_package_version ?? '1.0.0', commit: this.env.GIT_COMMIT };
  }
}
