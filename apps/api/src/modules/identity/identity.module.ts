import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV, type Env } from '../../config/config.module';
import { CACHE, LruCacheProvider } from '../../common/cache/cache.provider';
import { IdentityService } from './identity.service';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: env.ACCESS_TOKEN_TTL_SEC, algorithm: 'HS256' as const },
        verifyOptions: { algorithms: ['HS256' as const] },
      }),
    }),
  ],
  providers: [{ provide: CACHE, useClass: LruCacheProvider }, IdentityService, RateLimitService],
  exports: [CACHE, IdentityService, RateLimitService, JwtModule],
})
export class IdentityModule {}
