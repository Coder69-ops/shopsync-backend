import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentMethodService } from './payment-method.service';
import { PaymentMethodController } from './payment-method.controller';
import { DatabaseModule } from '../database/database.module';

import { SystemConfigModule } from '../superadmin/system-config.module';
import { SuperAdminModule } from '../superadmin/superadmin.module';
import { NotificationModule } from '../notification/notification.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    DatabaseModule,
    SystemConfigModule,
    SuperAdminModule,
    NotificationModule,
    EmailModule,
  ],
  controllers: [PaymentController, PaymentMethodController],
  providers: [PaymentService, PaymentMethodService],
  exports: [PaymentService, PaymentMethodService],
})
export class PaymentModule { }
