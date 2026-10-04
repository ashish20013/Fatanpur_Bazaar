import { Global, Module } from '@nestjs/common';
import { CartController, CartMergeController } from './cart.controller';
import { CartService } from './cart.service';

@Global()
@Module({ controllers: [CartMergeController, CartController], providers: [CartService], exports: [CartService] })
export class CartModule {}
