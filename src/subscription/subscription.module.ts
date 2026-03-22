import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { SystemConfigModule } from '../superadmin/system-config.module';

@Module({
  imports: [DatabaseModule, EmailModule, SystemConfigModule],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
