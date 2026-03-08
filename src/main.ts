import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // 1. Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Required for BullBoard UI
    }),
  );

  // 2. CORS
  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL,
    'https://shopsync.it.com',
    'https://www.shopsync.it.com',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed = allowedOrigins.some(
        (ao) =>
          origin === ao ||
          origin.endsWith('.vercel.app') ||
          origin.endsWith('.it.com'),
      );

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  });

  // 3. Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if extra properties sent
      transform: true, // Auto-transform payloads to DTO instances
    }),
  );

  // 4. Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('ShopSync AI API')
    .setDescription('The backend API for ShopSync Store')
    .setVersion('1.0')
    .addTag('shop')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 5. Bull Board
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const chatQueue = app.get(getQueueToken('chat-queue'));
  const syncQueue = app.get(getQueueToken('sync-queue'));

  createBullBoard({
    queues: [new BullMQAdapter(chatQueue), new BullMQAdapter(syncQueue)],
    serverAdapter: serverAdapter,
  });

  const basicAuth = require('express-basic-auth');
  app.use(
    '/admin/queues',
    basicAuth({
      users: {
        [process.env.BULL_BOARD_USER || 'admin']: process.env.BULL_BOARD_PASSWORD || 'ShopSync!@#2026',
      },
      challenge: true,
    }),
    serverAdapter.getRouter()
  );

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
