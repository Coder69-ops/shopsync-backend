import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Param,
  Logger,
  Req,
  UnauthorizedException,
  RawBodyRequest,
} from '@nestjs/common';
import { SyncProcessor } from './sync.processor';
import * as crypto from 'crypto';
import { Request } from 'express';

@Controller('integration/webhook')
export class IntegrationWebhookController {
  private readonly logger = new Logger(IntegrationWebhookController.name);

  constructor(private readonly syncProcessor: SyncProcessor) {}

  @Post('woocommerce/:shopId')
  @HttpCode(200)
  async handleWooCommerceWebhook(
    @Param('shopId') shopId: string,
    @Headers('x-wc-webhook-topic') topic: string,
    @Body() payload: any,
  ) {
    this.logger.log(`Received WooCommerce webhook ${topic} for shop ${shopId}`);
    if (!topic || !topic.startsWith('product.')) return 'OK';

    await this.syncProcessor.processWebhook(
      shopId,
      'WOOCOMMERCE',
      topic,
      payload,
    );
    return 'OK';
  }

  @Post('shopify/:shopId')
  @HttpCode(200)
  async handleShopifyWebhook(
    @Param('shopId') shopId: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-hmac-sha256') hmac: string,
    @Body() payload: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.logger.log(`Received Shopify webhook ${topic} for shop ${shopId}`);
    if (!topic || !topic.startsWith('products/')) return 'OK';

    // 1. Validate Shopify Signature
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!secret) {
      this.logger.error('SHOPIFY_CLIENT_SECRET is missing!');
      throw new UnauthorizedException('Webhook secret missing');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body');
    }

    const calculatedHmac = crypto
      .createHmac('sha256', secret)
      .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody))
      .digest('base64');

    if (calculatedHmac !== hmac) {
      this.logger.warn(
        `Shopify signature mismatch for shop ${shopId}. Expected ${calculatedHmac}, got ${hmac}`,
      );
      throw new UnauthorizedException('Invalid signature');
    }

    await this.syncProcessor.processWebhook(shopId, 'SHOPIFY', topic, payload);
    return 'OK';
  }
}
