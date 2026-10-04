import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { IdentityModule } from './modules/identity/identity.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AuditModule } from './modules/audit/audit.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { ServiceAreaModule } from './modules/service-area/service-area.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { UsersModule } from './modules/users/users.module';
import { CartModule } from './modules/cart/cart.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { RecordsCoreModule } from './modules/payments/payments-core.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { ServicesModule } from './modules/services/services.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { ContentModule } from './modules/content/content.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { TasksModule } from './modules/jobs/tasks.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard, RolesGuard } from './common/guards/roles.guard';
import { OwnershipGuard } from './common/guards/ownership.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Module order matters for the order-state hooks: payments (COD→PAID) must register before
 * referrals (which reads the payment status) — Nest initialises modules in import order.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    IdentityModule,
    SettingsModule,
    AuditModule,
    JobsModule,
    NotificationsModule,
    WalletModule,
    AuthModule,
    StaffModule,
    ServiceAreaModule,
    CatalogModule,
    UsersModule,
    CartModule,
    CouponsModule,
    RecordsCoreModule,
    OrdersModule,
    PaymentsModule,
    TrackingModule,
    DeliveryModule,
    ServicesModule,
    PrescriptionsModule,
    ReviewsModule,
    ReferralsModule,
    ContentModule,
    AdminModule,
    HealthModule,
    TasksModule,
  ],
  providers: [
    // Guard chain (request lifecycle §5): auth → roles → permissions → ownership → rate limit
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: OwnershipGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
