import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        this.logger.warn(
          'GEMINI_API_KEY is missing. Returning empty array for embedding.',
        );
        // In a real scenario, you might want to throw an error or use a fallback
        return [];
      }

      // We use text-embedding-004 which returns 768 dimensions
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

      const response = await axios.post(url, {
        model: 'models/text-embedding-004',
        content: {
          parts: [{ text: text }],
        },
      });

      if (
        response.data &&
        response.data.embedding &&
        response.data.embedding.values
      ) {
        return response.data.embedding.values;
      }

      throw new Error('Invalid response structure from Gemini API');
    } catch (error: any) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      // Return empty array on failure so it doesn't crash the sync, just won't be easily searchable
      return [];
    }
  }
}
