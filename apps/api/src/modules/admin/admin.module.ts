import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController, AdminSettingsController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({ imports: [AuthModule], controllers: [AdminController, AdminSettingsController], providers: [AdminService], exports: [AdminService] })
export class AdminModule {}
