import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';
import { MarketingProcessor } from './marketing.processor';
import { DatabaseModule } from '../database/database.module';
import { FacebookModule } from '../facebook/facebook.module';
import { CustomerModule } from '../customer/customer.module';
import { AiModule } from '../ai/ai.module'; // To use AI content generation if available, or Gemini

@Module({
  imports: [
    DatabaseModule,
    FacebookModule,
    CustomerModule,
    AiModule,
    BullModule.registerQueue({
      name: 'marketing-queue',
    }),
  ],
  controllers: [MarketingController],
  providers: [MarketingService, MarketingProcessor],
})
export class MarketingModule { }
