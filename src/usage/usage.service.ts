import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SubscriptionPlan } from '@prisma/client';

export interface UsagePeriod {
  start: Date;
  end: Date;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private db: DatabaseService) {}

  /**
   * Calculates the current usage period (cycle) for a shop.
   * For PRO/BASIC: Based on the day of the month of subscriptionEndsAt.
   * For PRO_TRIAL: The span of the trial.
   * For FREE: The current calendar month.
   */
  public async getUsagePeriod(shop: any): Promise<UsagePeriod> {
    const now = new Date();

    // 1. For PRO_TRIAL: Use trial start and end
    if (shop.plan === 'PRO_TRIAL' && shop.trialEndsAt) {
      const end = new Date(shop.trialEndsAt);
      const start = new Date(end);
      start.setDate(start.getDate() - 14); // Standard 14 day trial
      return {
        start: start > now ? now : start,
        end,
      };
    }

    // 2. For PRO / BASIC: Use subscription cycle
    if (
      (shop.plan === 'PRO' || shop.plan === 'BASIC') &&
      shop.subscriptionEndsAt
    ) {
      const subEnd = new Date(shop.subscriptionEndsAt);
      const billingDay = subEnd.getDate();

      // Determine the start of the current cycle based on billing Day
      let start = new Date(now.getFullYear(), now.getMonth(), billingDay);
      if (start > now) {
        start.setMonth(start.getMonth() - 1);
      }

      // Handle edge case: if billing day is 31st and current month has 30 days,
      // JavaScript Date handles this by overflowing, but we want it to pin to last day.
      if (start.getDate() !== billingDay && billingDay > 28) {
        start = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
      }

      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);

      return { start, end };
    }

    // 3. Fallback: Standard Calendar Month
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
    return { start: startOfMonth, end: endOfMonth };
  }

  public async getUsagePeriodStart(shop: any): Promise<Date> {
    const period = await this.getUsagePeriod(shop);
    return period.start;
  }

  async canSendMessage(shopId: string, shopData?: any): Promise<boolean> {
    const shop =
      shopData ||
      (await this.db.shop.findUnique({
        where: { id: shopId },
      }));

    if (!shop) return false;

    const planConfig = await this.db.planConfig.findUnique({
      where: { plan: shop.plan },
    });

    // PRO_TRIAL has unlimited messages; treat missing config as unlimited for trial/pro
    if (!planConfig) {
      this.logger.warn(
        `No planConfig found for plan=${shop.plan} (shop=${shopId}). Go to SuperAdmin > Plans to initialize it.`,
      );
      if (shop.plan === 'PRO_TRIAL' || shop.plan === 'PRO') return true;
      return false;
    }

    // Determine the actual limit (Shop Override > Global Plan Limit)
    const activeLimit =
      shop.customMessageLimit !== null
        ? shop.customMessageLimit
        : planConfig.messageLimit;

    if (activeLimit === -1) return true; // Unlimited

    // Count usage for current period (Subscription-aware)
    const { start: startDate } = await this.getUsagePeriod(shop);

    const usage = await this.db.usageLog.aggregate({
      where: {
        shopId,
        type: 'MESSAGE_AI',
        createdAt: { gte: startDate },
      },
      _count: { id: true },
    });

    const currentUsage = usage._count.id || 0;
    const canSend = currentUsage < activeLimit;

    if (!canSend) {
      this.logger.warn(
        `Shop ${shopId} has reached its message limit (${currentUsage}/${activeLimit})`,
      );
    }

    return canSend;
  }

  async canCreateOrder(shopId: string, shopData?: any): Promise<boolean> {
    const shop =
      shopData ||
      (await this.db.shop.findUnique({
        where: { id: shopId },
      }));

    if (!shop) return false;

    const planConfig = await this.db.planConfig.findUnique({
      where: { plan: shop.plan },
    });

    // PRO_TRIAL has unlimited orders; treat missing config as unlimited for trial/pro
    if (!planConfig) {
      this.logger.warn(
        `No planConfig found for plan=${shop.plan} (shop=${shopId}). Go to SuperAdmin > Plans to initialize it.`,
      );
      if (shop.plan === 'PRO_TRIAL' || shop.plan === 'PRO') return true;
      return false;
    }

    // Determine the actual limit (Shop Override > Global Plan Limit)
    const activeLimit =
      shop.customOrderLimit !== null
        ? shop.customOrderLimit
        : planConfig.orderLimit;

    if (activeLimit === -1) return true; // Unlimited

    // Count usage for current period (Subscription-aware)
    const { start: startDate } = await this.getUsagePeriod(shop);

    const usage = await this.db.order.count({
      where: {
        shopId,
        createdAt: { gte: startDate },
      },
    });

    return usage < activeLimit;
  }

  async hasFeatureAccess(
    shopId: string,
    featureKey: string,
    shopData?: any,
  ): Promise<boolean> {
    const shop =
      shopData || (await this.db.shop.findUnique({ where: { id: shopId } }));
    if (!shop) return false;

    // Check for custom feature overrides
    if (shop.customFeatures && typeof shop.customFeatures === 'object') {
      const customFeatures = shop.customFeatures as Record<string, any>;
      if (customFeatures[featureKey] !== undefined) {
        return !!customFeatures[featureKey];
      }
    }

    // Fallback to Global Plan Config
    const planConfig = await this.db.planConfig.findUnique({
      where: { plan: shop.plan },
    });

    if (!planConfig) return false;

    return !!(planConfig as any)[featureKey];
  }
}
