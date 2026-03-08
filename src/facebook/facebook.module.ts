import { Module } from '@nestjs/common';
import { FacebookService } from './facebook.service';
import { FacebookController } from './facebook.controller';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { FacebookCapiService } from './facebook-capi.service';
import { BullModule } from '@nestjs/bullmq';
import { FacebookCapiProcessor } from './facebook-capi.processor';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    BullModule.registerQueue({
      name: 'facebook-capi',
    }),
  ],
  controllers: [FacebookController],
  providers: [FacebookService, FacebookCapiService, FacebookCapiProcessor],
  exports: [FacebookService, FacebookCapiService, BullModule],
})
export class FacebookModule { }
