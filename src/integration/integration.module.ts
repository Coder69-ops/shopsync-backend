import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IntegrationService } from './integration.service';
import { IntegrationController } from './integration.controller';
import { SyncProcessor } from './sync.processor';
import { EmbeddingsService } from './embeddings.service';
import { DatabaseModule } from '../database/database.module';
import { IntegrationWebhookController } from './integration-webhook.controller';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: 'sync-queue',
    }),
  ],
  providers: [IntegrationService, SyncProcessor, EmbeddingsService],
  controllers: [IntegrationController, IntegrationWebhookController],
  exports: [IntegrationService, EmbeddingsService]
})
export class IntegrationModule { }
