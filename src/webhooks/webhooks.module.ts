import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [WebhooksController],
})
export class WebhooksModule { }
