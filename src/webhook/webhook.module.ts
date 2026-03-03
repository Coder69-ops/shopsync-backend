import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { OrderModule } from '../order/order.module';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { VoiceModule } from '../voice/voice.module';
import { DatabaseModule } from '../database/database.module';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: 'chat-queue',
    }),
    AiModule,
    OrderModule,
    VoiceModule,
    FacebookModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookProcessor],
})
export class WebhookModule {}
