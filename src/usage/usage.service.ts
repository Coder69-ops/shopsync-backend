import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(private db: DatabaseService) {}

  async canSendMessage(shopId: string): Promise<boolean> {
    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) return false;

    const planConfig = await this.db.planConfig.findUnique({
      where: { plan: shop.plan },
    });

    // PRO_TRIAL has unlimited messages; treat missing config as unlimited for trial/pro
    if (!planConfig) {
      this.logger.warn(`No planConfig found for plan=${shop.plan} (shop=${shopId}). Go to SuperAdmin > Plans to initialize it.`);
      if (shop.plan === 'PRO_TRIAL' || shop.plan === 'PRO') return true;
      return false;
    }

    // Determine the actual limit (Shop Override > Global Plan Limit)
    const activeLimit =
      shop.customMessageLimit !== null
        ? shop.customMessageLimit
        : planConfig.messageLimit;

    if (activeLimit === -1) return true; // Unlimited

    // Count usage for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await this.db.usageLog.aggregate({
      where: {
        shopId,
        type: 'MESSAGE_AI',
        createdAt: { gte: startOfMonth },
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

  async canCreateOrder(shopId: string): Promise<boolean> {
    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) return false;

    const planConfig = await this.db.planConfig.findUnique({
      where: { plan: shop.plan },
    });

    // PRO_TRIAL has unlimited orders; treat missing config as unlimited for trial/pro
    if (!planConfig) {
      this.logger.warn(`No planConfig found for plan=${shop.plan} (shop=${shopId}). Go to SuperAdmin > Plans to initialize it.`);
      if (shop.plan === 'PRO_TRIAL' || shop.plan === 'PRO') return true;
      return false;
    }

    // Determine the actual limit (Shop Override > Global Plan Limit)
    const activeLimit =
      shop.customOrderLimit !== null
        ? shop.customOrderLimit
        : planConfig.orderLimit;

    if (activeLimit === -1) return true; // Unlimited

    // Count usage for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usage = await this.db.order.count({
      where: {
        shopId,
        createdAt: { gte: startOfMonth },
      },
    });

    return usage < activeLimit;
  }

  async hasFeatureAccess(shopId: string, featureKey: string): Promise<boolean> {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
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
