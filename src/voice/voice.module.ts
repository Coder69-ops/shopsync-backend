import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
