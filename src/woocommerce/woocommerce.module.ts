import { Module, forwardRef } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { WooCommerceWebhookController } from './woocommerce-webhook.controller';
import { WooCommerceController } from './woocommerce.controller';
import { DatabaseModule } from '../database/database.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => OrderModule), // Needed for the Webhook Controller to update orders
  ],
  providers: [WooCommerceService],
  controllers: [WooCommerceWebhookController, WooCommerceController],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
