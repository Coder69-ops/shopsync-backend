import { Module } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { SuperadminController } from './superadmin.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule { }
