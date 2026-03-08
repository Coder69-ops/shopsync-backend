import {
  Controller,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderService } from '../order/order.service';
import { RedxWebhookDto } from './redx-webhook.dto';

/**
 * Only terminal statuses trigger a DB update.
 * All other intermediate statuses (e.g. "delivery-in-progress") return 200 OK
 * so RedX does not retry, but no DB write is performed.
 */
const REDX_STATUS_MAP: Record<string, string> = {
  delivered: 'DELIVERED',
  returned: 'RETURNED',
  cancelled: 'CANCELLED',
  'pickup-pending': 'SHIPPED',
  'pickup-rescheduled': 'SHIPPED',
  'received-at-pickup-hub': 'SHIPPED',
  'in-transit': 'SHIPPED',
  'received-at-delivery-hub': 'SHIPPED',
  'out-for-delivery': 'SHIPPED',
  'delivery-rescheduled': 'SHIPPED',
  'hold-at-delivery-hub': 'SHIPPED',
  'return-in-transit': 'SHIPPED',
  'received-at-return-hub': 'SHIPPED',
  'agent-hold': 'SHIPPED',
};

@Controller('webhooks/redx')
export class RedxWebhookController {
  private readonly logger = new Logger(RedxWebhookController.name);

  constructor(
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * POST /webhooks/redx?token=<REDX_WEBHOOK_SECRET>
   *
   * RedX calls this endpoint when a parcel status changes.
   * Auth is done via a query-string token that matches REDX_WEBHOOK_SECRET.
   * Payload shape (RedX official docs):
   * {
   *   tracking_number: string,
   *   status: string,
   *   timestamp?: string,
   *   message_en?: string,
   *   message_bn?: string,
   *   invoice_number?: string
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleRedxWebhook(
    @Body() dto: RedxWebhookDto,
    @Query('token') queryToken: string,
  ) {
    // ── 1. Query-token auth ───────────────────────────────────────────────────
    const expectedSecret = this.configService.get<string>('REDX_WEBHOOK_SECRET');
    if (expectedSecret) {
      if (queryToken !== expectedSecret) {
        this.logger.warn('RedX webhook: invalid query token');
        throw new UnauthorizedException('Invalid webhook token');
      }
    }

    const trackingNumber = dto.tracking_number;
    const redxStatus = dto.status.toLowerCase();

    this.logger.log(
      `RedX webhook received: tracking=${trackingNumber} status="${redxStatus}"`,
    );

    // ── 2. Determine mapped status ───────────────────────────────────────────
    const internalStatus = REDX_STATUS_MAP[redxStatus];

    // ── 3. Always update shipmentStatus (granular) ───────────────────────────
    await this.orderService.updateOrderStatusByTrackingId(
      trackingNumber,
      internalStatus, // may be undefined for intermediate statuses
      dto.status, // raw RedX status (e.g. "pickup-pending")
    );

    return { success: true };

    return { success: true };
  }
}
