import { Controller, Post, Body, Headers, HttpCode, HttpStatus, Logger, UnauthorizedException, RawBodyRequest, Req, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';
import { OrderService } from '../order/order.service';

@Controller('webhooks/woocommerce')
export class WooCommerceWebhookController {
    private readonly logger = new Logger(WooCommerceWebhookController.name);

    constructor(
        private readonly configService: ConfigService,
        @Inject(forwardRef(() => OrderService))
        private readonly orderService: OrderService,
    ) { }

    /**
     * POST /webhooks/woocommerce
     * 
     * WooCommerce sends webhooks here (e.g., product creation, order updates).
     * Validates the request using HMAC SHA256 and the RAW body.
     */
    @Post()
    @HttpCode(HttpStatus.OK)
    async handleWooCommerceWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('x-wc-webhook-signature') signature: string,
        @Headers('x-wc-webhook-topic') topic: string,
        @Headers('x-wc-webhook-resource') resource: string,
        @Headers('x-wc-webhook-event') event: string,
    ) {
        this.logger.log(`Received WooCommerce webhook: Topic=${topic}`);

        // Verify Signature
        const secret = this.configService.get<string>('WOOCOMMERCE_WEBHOOK_SECRET');
        if (!secret) {
            this.logger.warn('WOOCOMMERCE_WEBHOOK_SECRET is not configured.');
            // Proceeding without signature check if not configured in env
        } else if (signature && req.rawBody) {
            const generatedSignature = crypto
                .createHmac('sha256', secret)
                .update(req.rawBody)
                .digest('base64');

            if (signature !== generatedSignature) {
                this.logger.error('Invalid WooCommerce Webhook Signature.');
                throw new UnauthorizedException('Invalid Signature');
            }
        } else {
            throw new UnauthorizedException('Missing Signature or Raw Body');
        }

        const payload = req.body;

        // Route actions based on topic
        try {
            if (topic === 'product.created' || topic === 'product.updated') {
                this.logger.log(`Product ${payload.id} updated or created via Webhook`);
                // We handle syncing in WooCommerceService, here we might trigger an individual update
            } else if (topic === 'order.created' || topic === 'order.updated') {
                this.logger.log(`Order ${payload.id} updated via Webhook`);
                // Logic to update Order model statuses if needed
            }

        } catch (error: any) {
            this.logger.error(`Failed to process WooCommerce webhook: ${error?.message}`);
        }

        return { success: true };
    }
}
