import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { ConfigModule } from '@nestjs/config';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [ConfigModule, UploadModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
