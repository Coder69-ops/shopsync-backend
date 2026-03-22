import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  RawBodyRequest,
  Req,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';
import { OrderService } from '../order/order.service';

@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
  ) {}

  /**
   * POST /webhooks/shopify
   *
   * Shopify sends webhooks here (e.g., products/create, orders/updated).
   * Validates the request using HMAC SHA256 and the RAW body.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleShopifyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-shopify-hmac-sha256') signature: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shopDomain: string,
  ) {
    this.logger.log(
      `Received Shopify webhook: Topic=${topic} from Shop=${shopDomain}`,
    );

    // Verify Signature
    const secret = this.configService.get<string>('SHOPIFY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('SHOPIFY_WEBHOOK_SECRET is not configured.');
      // Proceeding without signature check if not configured in env
    } else if (signature && req.rawBody) {
      const generatedSignature = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('base64');

      if (signature !== generatedSignature) {
        this.logger.error('Invalid Shopify Webhook Signature.');
        throw new UnauthorizedException('Invalid Signature');
      }
    } else {
      throw new UnauthorizedException('Missing Signature or Raw Body');
    }

    const payload = req.body;

    // Route actions based on topic
    try {
      if (topic === 'products/create' || topic === 'products/update') {
        this.logger.log(`Product ${payload.id} updated or created via Webhook`);
        // We handle syncing in ShopifyService, here we might trigger an individual update
      } else if (topic === 'orders/create' || topic === 'orders/updated') {
        this.logger.log(`Order ${payload.id} updated via Webhook`);
        // Logic to update Order model statuses if needed
      }
    } catch (error: any) {
      this.logger.error(`Failed to process Shopify webhook: ${error?.message}`);
    }

    return { success: true };
  }
}
