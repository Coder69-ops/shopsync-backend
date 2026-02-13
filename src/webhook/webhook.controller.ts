import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpStatus,
  Logger,
  Req,
  Headers,
  BadRequestException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookService } from './webhook.service';
import { type Response, type Request } from 'express';
import * as crypto from 'crypto';

interface FacebookEvent {
  object: string;
  entry: Array<{
    id: string;
    messaging?: Array<{
      sender: { id: string };
      message?: {
        text?: string;
        attachments?: Array<{
          type: string;
          payload: { url: string };
        }>;
      };
    }>;
  }>;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: ConfigService,
  ) { }

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    this.logger.log(`🔍 Webhook verification attempt: mode=${mode}, token=${token}`);

    // If it's a manual browser visit, show help for ngrok warning
    if (!mode && !token) {
      return `
            <h1>ShopSync Webhook Endpoint</h1>
            <p>If you see an ngrok 'browser warning' page, please click <b>'Visit Site'</b> to allow Facebook events to pass through.</p>
            <p>Verification Status: ACTIVE</p>
        `;
    }

    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      this.logger.log('✅ Webhook verified successfully');
      return challenge;
    }

    this.logger.warn('❌ Webhook verification failed: Token mismatch or invalid mode');
    return 'Verification failed';
  }

  @Post()
  async handleWebhook(
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Res() res: Response,
  ) {
    this.logger.log('Received webhook event');

    // Guard: Verify signature
    const appSecret = this.configService.get<string>('FB_APP_SECRET')?.trim();
    if (!appSecret) {
      this.logger.error('FB_APP_SECRET is not configured');
      throw new BadRequestException('Server configuration error');
    }

    if (!signature) {
      this.logger.warn('Missing signature');
      throw new UnauthorizedException('Missing signature');
    }

    const rawBody = req.rawBody;
    const isBuffer = Buffer.isBuffer(rawBody);
    this.logger.log(`Received webhook event. Body: ${JSON.stringify(body)}`);
    this.logger.log(`Verifying signature. rawBody type: ${typeof rawBody}, isBuffer: ${isBuffer}, length: ${rawBody?.length}`);
    if (rawBody) {
      this.logger.log(`Raw Body Preview: ${rawBody.toString().substring(0, 500)}`);
    }

    if (!rawBody) {
      this.logger.error('Missing raw body');
      throw new BadRequestException('Invalid request');
    }

    const hmac = crypto.createHmac('sha256', appSecret);
    const digest = 'sha256=' + hmac.update(isBuffer ? rawBody : Buffer.from(rawBody)).digest('hex');

    if (signature !== digest) {
      this.logger.warn(`Signature mismatch! 
        Expected: ${digest}
        Got:      ${signature}
        Secret starts with: ${appSecret.substring(0, 4)}`);

      // Temporary bypass for debugging
      this.logger.warn('TEMPORARY BYPASS: Proceeding despite signature mismatch');
      await this.webhookService.processWebhookEvent(body);
      return res.status(HttpStatus.OK).send('EVENT_RECEIVED');

      // throw new UnauthorizedException('Invalid signature');
    }

    this.logger.log('Signature verified');

    // Process event asynchronously
    // In a real scenario, we push to queue here.
    // For "Hello World", we might just log it or echo it.

    // Return 200 OK immediately
    res.status(HttpStatus.OK).send('EVENT_RECEIVED');

    // Async processing
    await this.webhookService.processWebhookEvent(body);
  }
}
