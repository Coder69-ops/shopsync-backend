import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FacebookService } from '../facebook/facebook.service';

@Processor('marketing-queue', {
  limiter: {
    max: 50,
    duration: 60000, // 50 messages per minute
  },
})
export class MarketingProcessor extends WorkerHost {
  private readonly logger = new Logger(MarketingProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly facebookService: FacebookService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { campaignId, recipientId } = job.data;

    const recipient = await this.db.campaignRecipient.findUnique({
      where: { id: recipientId },
      include: { customer: true, campaign: { include: { shop: true } } },
    });

    if (!recipient || recipient.status !== 'PENDING') return;

    try {
      await this.facebookService.sendMessage(
        recipient.customer.externalId,
        recipient.campaign.message,
        recipient.campaign.shop.accessToken || '',
      );

      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    } catch (e) {
      this.logger.error(
        `Failed to send campaign message to ${recipient.customer.externalId}`,
        e,
      );

      await this.db.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: 'FAILED', errorMessage: e.message },
      });
    }

    // Check if campaign is finished
    const pendingCount = await this.db.campaignRecipient.count({
      where: { campaignId, status: 'PENDING' },
    });

    if (pendingCount === 0) {
      await this.db.campaign.update({
        where: { id: campaignId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }
  }
}
