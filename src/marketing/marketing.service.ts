import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FacebookService } from '../facebook/facebook.service';
import { CustomerService } from '../customer/customer.service';

@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly facebookService: FacebookService,
    private readonly customerService: CustomerService,
  ) {}

  async createCampaign(shopId: string, data: any) {
    return this.db.campaign.create({
      data: {
        shopId,
        name: data.name,
        message: data.message,
        audience: data.audience, // "ALL", "RECENT_24H"
        status: 'DRAFT',
      },
    });
  }

  async getCampaigns(shopId: string) {
    return this.db.campaign.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async sendCampaign(id: string, shopId: string) {
    const campaign = await this.db.campaign.findUnique({
      where: { id, shopId },
      include: { shop: true },
    });

    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
      throw new Error('Campaign already sent');
    }

    // Update status to SENDING
    await this.db.campaign.update({
      where: { id },
      data: { status: 'SENDING' },
    });

    // Fetch Audience
    let customers = await this.db.customer.findMany({
      where: { shopId },
    });

    // Apply Filter: 24h Window
    if (campaign.audience === 'RECENT_24H') {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      customers = customers.filter(
        (c: any) => c.updatedAt > twentyFourHoursAgo,
      );
    }

    let sentCount = 0;
    let failedCount = 0;

    // Send Messages (Batching is better, but loop is fine for MVP)
    for (const customer of customers) {
      try {
        // If the customer isn't Facebook, skip for now
        if (customer.platform !== 'FACEBOOK') continue;

        await this.facebookService.sendMessage(
          customer.externalId,
          campaign.message,
          campaign.shop.accessToken || '', // Fallback to empty string or handle error
        );
        sentCount++;
      } catch (e) {
        this.logger.error(`Failed to send to ${customer.externalId}`, e);
        failedCount++;
      }
    }

    // Update Status to SENT
    return this.db.campaign.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        stats: { sent: sentCount, failed: failedCount },
      },
    });
  }
}
