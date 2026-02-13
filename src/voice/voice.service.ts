import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey:
        this.configService.get<string>('GROQ_API_KEY') ||
        this.configService.get<string>('OPENROUTER_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1', // Defaulting to Groq for speed/cost as discussed
    });
  }

  async transcribeAudio(audioUrl: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}.mp4`);

    try {
      this.logger.log(`Downloading audio from: ${audioUrl}`);

      // 1. Download the file
      const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(tempFilePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', reject);
      });

      this.logger.log(`Audio downloaded to ${tempFilePath}`);

      // 2. Transcribe using OpenAI compatible API (Groq)
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-large-v3', // Groq's fast model
        language: 'bn', // Hinting Bengali if supported, otherwise it auto-detects
      });

      this.logger.log(`Transcription: ${transcription.text}`);
      return transcription.text;
    } catch (error) {
      this.logger.error('Error transcribing audio', error);
      return '[Audio Transcription Failed]';
    } finally {
      // Cleanup
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }
}
