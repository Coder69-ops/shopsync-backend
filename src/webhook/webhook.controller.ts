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
    this.logger.log(
      `🔍 Webhook verification attempt: mode=${mode}, token=${token}`,
    );

    // If it's a manual browser visit, show a professional status page
    if (!mode && !token) {
      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ShopSync Webhook Bridge</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #1f2937; }
                .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); text-align: center; max-width: 500px; width: 90%; }
                .status-badge { display: inline-block; background-color: #d1fae5; color: #065f46; padding: 6px 12px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 16px; min-width: 80px; }
                .status-dot { height: 8px; width: 8px; background-color: #10b981; border-radius: 50%; display: inline-block; margin-right: 6px; }
                h1 { margin: 0 0 16px; font-size: 24px; color: #111827; }
                p { color: #4b5563; line-height: 1.5; margin: 0 0 24px; }
                .footer { font-size: 13px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="status-badge"><span class="status-dot"></span> Active</div>
                <h1>ShopSync Webhook Bridge</h1>
                <p>This endpoint is securely listening for incoming events from integrated platforms (Facebook, Instagram, WhatsApp) to synchronize your data automatically.</p>
                <div class="footer">Infrastructure and Event Processing Engine &bull; ShopSync</div>
            </div>
        </body>
        </html>
      `;
    }

    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      this.logger.log('✅ Webhook verified successfully');
      return challenge;
    }

    this.logger.warn(
      '❌ Webhook verification failed: Token mismatch or invalid mode',
    );
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
    const fallbackSecret = this.configService
      .get<string>('FACEBOOK_APP_SECRET')
      ?.trim();
    const signatureSecret = appSecret || fallbackSecret;
    if (!signatureSecret) {
      this.logger.error('FB_APP_SECRET/FACEBOOK_APP_SECRET is not configured');
      throw new BadRequestException('Server configuration error');
    }

    if (!signature) {
      this.logger.warn('Missing signature');
      throw new UnauthorizedException('Missing signature');
    }

    const rawBody = req.rawBody;
    const isBuffer = Buffer.isBuffer(rawBody);
    this.logger.log(`Received webhook event. Body: ${JSON.stringify(body)}`);
    this.logger.log(
      `Verifying signature. rawBody type: ${typeof rawBody}, isBuffer: ${isBuffer}, length: ${rawBody?.length}`,
    );
    if (rawBody) {
      this.logger.log(
        `Raw Body Preview: ${rawBody.toString().substring(0, 500)}`,
      );
    }

    if (!rawBody) {
      this.logger.error('Missing raw body');
      throw new BadRequestException('Invalid request');
    }

    const hmac = crypto.createHmac('sha256', signatureSecret);
    const digest =
      'sha256=' +
      hmac.update(isBuffer ? rawBody : Buffer.from(rawBody)).digest('hex');

    const bypassEnabled =
      this.configService.get<string>('FB_SIGNATURE_BYPASS') === 'true';

    if (bypassEnabled) {
      this.logger.warn('⚠️ Webhook Signature BYPASS enabled! Skipping verification...');
    } else if (signature !== digest) {
      this.logger.warn(`Signature mismatch! 
        Expected: ${digest}
        Got:      ${signature}
        Secret MD5: ${crypto.createHash('md5').update(signatureSecret).digest('hex')}
      `);

      const bypassEnabled = this.configService.get<string>('FB_SIGNATURE_BYPASS') === 'true';
      if (!bypassEnabled) {
        throw new UnauthorizedException('Invalid signature');
      }
      this.logger.warn('FB_SIGNATURE_BYPASS is enabled. Proceeding anyway.');
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
