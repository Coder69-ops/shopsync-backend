import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ProductModule } from '../product/product.module';
import { DatabaseModule } from '../database/database.module';
import { SystemConfigModule } from '../superadmin/system-config.module';
import { IntegrationModule } from '../integration/integration.module';
import { RedxModule } from '../redx/redx.module';

@Module({
  imports: [ProductModule, DatabaseModule, SystemConfigModule, IntegrationModule, RedxModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule { }
