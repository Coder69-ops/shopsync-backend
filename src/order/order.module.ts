import { Module, forwardRef } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { DatabaseModule } from '../database/database.module';
import { CourierModule } from '../courier/courier.module';
import { FacebookModule } from '../facebook/facebook.module';
import { CustomerModule } from '../customer/customer.module';
import { UsageModule } from '../usage/usage.module';
import { RedxModule } from '../redx/redx.module';
import { EmailModule } from '../email/email.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { ShopifyModule } from '../shopify/shopify.module';

import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, CourierModule, FacebookModule, CustomerModule, UsageModule, EmailModule, forwardRef(() => RedxModule), forwardRef(() => WooCommerceModule), forwardRef(() => ShopifyModule), forwardRef(() => AiModule)],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule { }
