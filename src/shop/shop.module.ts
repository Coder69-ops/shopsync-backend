import { Module } from '@nestjs/common';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { DatabaseModule } from '../database/database.module';

import { ShopCleanupService } from './shop-cleanup.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ShopController],
  providers: [ShopService, ShopCleanupService],
  exports: [ShopService],
})
export class ShopModule {}
