import { Module, Global } from '@nestjs/common';
import { UsageService } from './usage.service';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
