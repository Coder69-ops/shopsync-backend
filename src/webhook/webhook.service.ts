import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectQueue('chat-queue') private chatQueue: Queue,
    private readonly db: DatabaseService,
  ) {}

  async processWebhookEvent(body: any) {
    // 1. Extract Shop ID (assuming it's in the body or we look it up via Page ID)
    // For now, let's assume body.entry[0].id is the Page ID, and we find the shop.
    const pageId = body.entry?.[0]?.id;
    if (!pageId) {
      this.logger.warn('Webhook received without Page ID, dropping.');
      return;
    }

    const shop = await this.db.shop.findFirst({
      where: {
        platformIds: {
          path: ['facebook'],
          equals: pageId,
        },
      },
      include: { users: true }, // Get owner to check trial
    });

    if (!shop) {
      this.logger.warn(`No shop found for Page ID ${pageId}`);
      // We still might want to process it if we are just setting up, but for "Hard Stop" logic:
      return;
    }

    // 2. Check Subscription "Hard Stop"
    const owner = shop.users.find(
      (u: any) => u.role === 'ADMIN' || u.role === 'SUPERADMIN',
    ); // simplistic check
    if (owner) {
      // Superadmin bypass
      if (owner.role === 'SUPERADMIN') {
        // allow
      } else if (
        shop.plan === SubscriptionPlan.FREE ||
        shop.plan === SubscriptionPlan.PRO_TRIAL
      ) {
        if (!owner.trialEndsAt || new Date() > new Date(owner.trialEndsAt)) {
          this.logger.warn(
            `[HARD STOP] Shop ${shop.name} (User ${owner.id}) trial expired. Dropping message.`,
          );
          return; // DROP THE EVENT
        }
      }
    }

    this.logger.log('Processing webhook event: ' + JSON.stringify(body));
    await this.chatQueue.add('message', body);
    this.logger.log('Added job to chat-queue');
  }
}
