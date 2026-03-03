import { Module } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { DatabaseModule } from '../database/database.module';
import { FacebookModule } from '../facebook/facebook.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [DatabaseModule, FacebookModule, CustomerModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
