import { Module, Global } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';
import { DatabaseModule } from '../database/database.module';
import { PublicConfigController } from './public-config.controller';

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [PublicConfigController],
  providers: [SystemConfigService],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
