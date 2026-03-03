import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { SystemConfigModule } from '../superadmin/system-config.module';

@Module({
  imports: [DatabaseModule, EmailModule, SystemConfigModule],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule { }
