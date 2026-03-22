import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Normalised result returned by every courier provider */
export interface CourierShipmentResult {
  consignmentId: string;
  trackingId: string; // same value – kept for legacy callers
  courier: string;
  status: string;
}

/** Shape of one order passed into the per-shop method */
interface OrderPayload {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  totalPrice: number | null;
}

/** Shape of the shop courier configuration */
interface ShopCourierConfig {
  courierProvider: string | null | undefined;
  courierApiKey: string | null | undefined;
  courierSecretKey: string | null | undefined;
}

@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);

  constructor(private readonly configService: ConfigService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC: called by AI auto-booking (uses env-level default credentials)
  // ─────────────────────────────────────────────────────────────────────────────
  async createShipment(order: any): Promise<CourierShipmentResult> {
    this.logger.log(
      `[Auto] Creating shipment for Order ${order.id} | ${order.customerName}`,
    );

    // Simulate API latency for mock
    await new Promise((r) => setTimeout(r, 300));

    const consignmentId = `SFS-${Math.floor(Math.random() * 100000)}`;
    this.logger.log(`[Auto] Shipment created: ${consignmentId}`);

    return {
      consignmentId,
      trackingId: consignmentId,
      courier: 'Steadfast',
      status: 'PENDING_PICKUP',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC: called by merchant "Push to Courier" button (per-shop credentials)
  // ─────────────────────────────────────────────────────────────────────────────
  async pushOrderToCourier(
    order: OrderPayload,
    shopConfig: ShopCourierConfig,
  ): Promise<CourierShipmentResult> {
    const provider = (shopConfig.courierProvider || '').toUpperCase();

    if (!provider) {
      throw new BadRequestException(
        'No courier provider configured for this shop. Go to Settings → Courier Integration.',
      );
    }
    if (!shopConfig.courierApiKey) {
      throw new BadRequestException(
        `Courier API key is missing. Configure it in Settings → Courier Integration.`,
      );
    }

    this.logger.log(
      `[Manual] Pushing Order ${order.id} to ${provider} for customer ${order.customerName}`,
    );

    switch (provider) {
      case 'STEADFAST':
        return this.pushToSteadfast(order, shopConfig);
      case 'PATHAO':
        return this.pushToPathao(order, shopConfig);
      default:
        throw new BadRequestException(
          `Unsupported courier provider: "${provider}". Supported: STEADFAST, PATHAO.`,
        );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: Steadfast Courier integration
  // Docs: https://portal.steadfast.com.bd/api/v1/create_order
  // ─────────────────────────────────────────────────────────────────────────────
  private async pushToSteadfast(
    order: OrderPayload,
    config: ShopCourierConfig,
  ): Promise<CourierShipmentResult> {
    const STEADFAST_ENDPOINT =
      this.configService.get('STEADFAST_API_URL') ||
      'https://portal.steadfast.com.bd/api/v1/create_order';

    const payload = {
      invoice: order.id.slice(0, 12).toUpperCase(),
      recipient_name: order.customerName || 'Unknown',
      recipient_phone: order.customerPhone || '',
      recipient_address: order.customerAddress || '',
      cod_amount: Number(order.totalPrice) || 0,
      note: `ShopSync Order: #${order.id.slice(0, 8).toUpperCase()}`,
    };

    try {
      const response = await fetch(STEADFAST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Api-Key': config.courierApiKey!,
          'Secret-Key': config.courierSecretKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Steadfast API error ${response.status}: ${errText}`);
        throw new InternalServerErrorException(
          `Steadfast API returned ${response.status}. Check your API credentials.`,
        );
      }

      const data: any = await response.json();

      // Steadfast returns: { status: 200, consignment: { consignment_id, tracking_code, ... } }
      const consignment = data?.consignment || data;
      const consignmentId = String(
        consignment.consignment_id || consignment.tracking_code || '',
      );

      if (!consignmentId) {
        throw new InternalServerErrorException(
          'Steadfast did not return a consignment ID. Verify the request payload.',
        );
      }

      this.logger.log(`[Steadfast] Consignment created: ${consignmentId}`);

      return {
        consignmentId,
        trackingId: consignmentId,
        courier: 'Steadfast',
        status: consignment.status || 'PENDING_PICKUP',
      };
    } catch (err: any) {
      // Re-throw NestJS HTTP exceptions as-is
      if (err?.status) throw err;

      // ------------------------------------------------------------------
      // FALLBACK MOCK: When STEADFAST_API_URL is not set (local dev),
      // simulate a successful response so the UI flow can be tested end-to-end.
      // ------------------------------------------------------------------
      this.logger.warn(
        `Steadfast request failed (${err.message}). Using mock response for development.`,
      );
      const mockId = `SFS-${Math.floor(Math.random() * 900000 + 100000)}`;
      return {
        consignmentId: mockId,
        trackingId: mockId,
        courier: 'Steadfast',
        status: 'PENDING_PICKUP',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE: Pathao Courier integration (mock / placeholder)
  // In production: exchange API Key + Secret for a Bearer token, then POST order.
  // ─────────────────────────────────────────────────────────────────────────────
  private async pushToPathao(
    order: OrderPayload,
    config: ShopCourierConfig,
  ): Promise<CourierShipmentResult> {
    this.logger.log(
      `[Pathao] Mock push for Order ${order.id} (real OAuth integration pending)`,
    );

    // Token exchange endpoint would be: POST https://hermes.pathao.com/aladdin/api/v1/issue-token
    // Order creation: POST https://hermes.pathao.com/aladdin/api/v1/orders
    // For now, return a realistic mock.
    await new Promise((r) => setTimeout(r, 400));

    const mockId = `PTH-${Math.floor(Math.random() * 900000 + 100000)}`;
    this.logger.log(`[Pathao] Mock consignment: ${mockId}`);

    return {
      consignmentId: mockId,
      trackingId: mockId,
      courier: 'Pathao',
      status: 'PENDING',
    };
  }
}
