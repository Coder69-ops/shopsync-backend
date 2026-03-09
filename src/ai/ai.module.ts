import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiService } from './ai.service';
import { AiAnalyticsProcessor } from './ai-analytics.processor';
import { AiAnalyticsSchedulerService } from './ai-analytics-scheduler.service';
import { ProductModule } from '../product/product.module';
import { DatabaseModule } from '../database/database.module';
import { SystemConfigModule } from '../superadmin/system-config.module';
import { IntegrationModule } from '../integration/integration.module';
import { RedxModule } from '../redx/redx.module';

@Module({
  imports: [
    ProductModule,
    DatabaseModule,
    SystemConfigModule,
    IntegrationModule,
    RedxModule,
    BullModule.registerQueue({
      name: 'ai-analytics-queue',
    }),
  ],
  providers: [AiService, AiAnalyticsProcessor, AiAnalyticsSchedulerService],
  exports: [AiService, BullModule, AiAnalyticsSchedulerService],
})
export class AiModule { }
