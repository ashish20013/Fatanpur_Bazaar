import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AccountDeletionController } from './account-deletion.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController, AccountDeletionController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
