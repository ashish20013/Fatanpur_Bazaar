import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Knex } from 'knex';
import { ENV, type Env } from '../config/config.module';
import { createKnex, KNEX } from './knex.provider';

@Global()
@Module({
  providers: [{ provide: KNEX, inject: [ENV], useFactory: (env: Env): Knex => createKnex(env) }],
  exports: [KNEX],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KNEX) private readonly db: Knex) {}
  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
