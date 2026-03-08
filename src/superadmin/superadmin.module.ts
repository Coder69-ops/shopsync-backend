import { Module } from '@nestjs/common';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { HealthService } from './health.service';
import { BullModule } from '@nestjs/bullmq';
import { SystemConfigService } from './system-config.service';

import { SystemConfigModule } from './system-config.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    SystemConfigModule,
    AiModule,
    BullModule.registerQueue({
      name: 'chat-queue',
    }),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, HealthService],
  exports: [SuperAdminService, SystemConfigModule],
})
export class SuperAdminModule { }
