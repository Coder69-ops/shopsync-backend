import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CourierService {
  private readonly logger = new Logger(CourierService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Mock functionality to push an order to a Courier (e.g. Steadfast, Pathao)
   * In a real app, this would hit their API endpoints.
   */
  async createShipment(
    order: any,
  ): Promise<{ trackingId: string; courier: string; status: string }> {
    this.logger.log(
      `Creating shipment for Order: ${order.id} | Customer: ${order.customerName}`,
    );

    // Simulate API latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock Response
    const trackingId = `SFS-${Math.floor(Math.random() * 100000)}`;
    const courier = 'Steadfast'; // Default mock courier
    const status = 'PENDING_PICKUP';

    this.logger.log(`Shipment Created! Tracking ID: ${trackingId}`);

    return {
      trackingId,
      courier,
      status,
    };
  }
}
