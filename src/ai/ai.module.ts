import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [ProductModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
