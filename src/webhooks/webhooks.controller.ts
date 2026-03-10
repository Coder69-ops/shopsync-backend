import {
    Controller,
    Post,
    Req,
    Res,
    Headers,
    HttpStatus,
    Logger,
    RawBodyRequest,
    BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Environment, Paddle } from '@paddle/paddle-node-sdk';
import { DatabaseService } from '../database/database.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/paddle')
export class WebhooksController {
    private readonly logger = new Logger(WebhooksController.name);
    private paddle: Paddle;

    constructor(
        private readonly prisma: DatabaseService,
        private readonly configService: ConfigService,
    ) {
        const paddleKey = this.configService.get<string>('PADDLE_API_KEY') || 'dummy_key';
        this.paddle = new Paddle(paddleKey, {
            environment: Environment.sandbox, // or use config to determine environment
        });
    }

    @Post()
    async handlePaddleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Headers('paddle-signature') signature: string,
        @Res() res: Response,
    ) {
        if (!signature) {
            this.logger.error('Missing paddle-signature header');
            return res.status(HttpStatus.BAD_REQUEST).send('Missing signature');
        }

        const secretKey = this.configService.get<string>('PADDLE_WEBHOOK_SECRET');
        if (!secretKey) {
            this.logger.error('PADDLE_WEBHOOK_SECRET is not configured');
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Configuration Error');
        }

        if (!req.rawBody) {
            this.logger.error('Missing raw body in the request');
            return res.status(HttpStatus.BAD_REQUEST).send('Missing raw body');
        }

        try {
            // 1. Verify Signature using Paddle SDK
            const eventData = await this.paddle.webhooks.unmarshal(
                req.rawBody.toString(),
                secretKey,
                signature,
            );

            this.logger.log(`Received Paddle Event: ${eventData.eventType}`);

            // 2. Handle specific events
            if (
                eventData.eventType === 'transaction.completed' ||
                eventData.eventType === 'subscription.created' ||
                eventData.eventType === 'subscription.updated'
            ) {
                // Safe access to customData which contains our shopId
                const customData = (eventData.data as any).customData;
                const shopId = customData?.shopId;

                if (shopId) {
                    const items = (eventData.data as any).items || [];
                    let planName = 'Pro';

                    if (items.length > 0) {
                        const priceId = items[0].price?.id || items[0].priceId;
                        if (priceId === 'pri_01kkc9yb73a5sjjj2j8zcm0zjm' || priceId === 'pri_01kkca1spzdtcgh919a33stg2q') {
                            planName = 'Starter';
                        } else if (priceId === 'pri_01kkca6jm0veq9dyspmfv552kx' || priceId === 'pri_01kkca94g0b9223kqg8dep6tng') {
                            planName = 'Pro Business';
                        }
                    }

                    const subscriptionId = (eventData.data as any).subscriptionId || (eventData.data as any).id;
                    const customerId = (eventData.data as any).customerId;

                    this.logger.log(`Upgrading shop ${shopId} to ${planName} and ACTIVE status.`);

                    await this.prisma.shop.update({
                        where: { id: shopId },
                        data: {
                            subscriptionStatus: 'ACTIVE',
                            subscriptionPlan: planName,
                            paddleSubscriptionId: subscriptionId,
                            paddleCustomerId: customerId,
                            merchantId: customerId, // Kept for legacy support
                            subscriptionId: subscriptionId // Kept for legacy support 
                        },
                    });
                } else {
                    this.logger.warn('Received transaction.completed but no shopId found in customData');
                }
            } else if (eventData.eventType === 'subscription.canceled') {
                const customData = (eventData.data as any).customData;
                const shopId = customData?.shopId;

                if (shopId) {
                    this.logger.log(`Downgrading shop ${shopId} to CANCELED status.`);
                    await this.prisma.shop.update({
                        where: { id: shopId },
                        data: {
                            subscriptionStatus: 'CANCELED',
                        },
                    });
                }
            }

            // Always return 200 quickly to acknowledge receipt
            return res.status(HttpStatus.OK).send();
        } catch (err) {
            this.logger.error(`Webhook processing error: ${(err as Error).message}`);
            return res.status(HttpStatus.BAD_REQUEST).send('Webhook Error');
        }
    }
}
