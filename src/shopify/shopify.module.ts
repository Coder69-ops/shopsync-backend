import { Module, forwardRef } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyController } from './shopify.controller';
import { DatabaseModule } from '../database/database.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => OrderModule), // Needed for the Webhook Controller to update orders
  ],
  providers: [ShopifyService],
  controllers: [ShopifyWebhookController, ShopifyController],
  exports: [ShopifyService],
})
export class ShopifyModule {}
