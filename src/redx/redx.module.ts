import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedxService } from './redx.service';
import { RedxWebhookController } from './redx-webhook.controller';
import { DatabaseModule } from '../database/database.module';
import { OrderModule } from '../order/order.module';

import { RedxController } from './redx.controller';

@Module({
  imports: [ConfigModule, DatabaseModule, forwardRef(() => OrderModule)],
  controllers: [RedxWebhookController, RedxController],
  providers: [RedxService],
  exports: [RedxService],
})
export class RedxModule {}
