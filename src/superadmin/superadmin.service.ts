import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SuperAdminService {
  constructor(private readonly db: DatabaseService) {}

  async getAllShops(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.db.shop.findMany({
      where,
      include: {
        _count: {
          select: { orders: true, users: true },
        },
        users: {
          where: { role: 'ADMIN' },
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShopDetails(id: string) {
    return this.db.shop.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            role: true,
            profilePic: true,
            hasSeenTour: true,
            isActive: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            products: true,
            customers: true,
            conversations: true,
          },
        },
      },
    });
  }

  async updateShopOverrides(shopId: string, data: any, adminId: string) {
    const updatedShop = await this.db.shop.update({
      where: { id: shopId },
      data: {
        customMessageLimit: data.customMessageLimit,
        customOrderLimit: data.customOrderLimit,
        customFeatures: data.customFeatures,
      },
    });

    await this.logAction(adminId, 'UPDATE_OVERRIDES', shopId, data);
    return updatedShop;
  }

  async updateShopPlan(
    shopId: string,
    plan: string,
    expiryDate?: Date,
    reason?: string,
    adminId?: string,
  ) {
    const validPlans = ['FREE', 'BASIC', 'PRO', 'PRO_TRIAL'];
    if (!validPlans.includes(plan)) throw new Error('Invalid Plan');

    const oldShop = await this.db.shop.findUnique({ where: { id: shopId } });

    const updatedShop = await this.db.shop.update({
      where: { id: shopId },
      data: {
        plan: plan as any,
        subscriptionEndsAt: expiryDate,
        // If plan is PRO, maybe activate? logic varies, keeping simple for now.
      },
    });

    if (adminId) {
      await this.logAction(adminId, 'CHANGE_PLAN', shopId, {
        oldPlan: oldShop?.plan,
        newPlan: plan,
        expiry: expiryDate,
        reason,
      });
    }

    return updatedShop;
  }

  async toggleShopSuspension(shopId: string, adminId: string) {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new Error('Shop not found');

    const newStatus = !shop.isActive;
    await this.db.shop.update({
      where: { id: shopId },
      data: { isActive: newStatus },
    });

    await this.logAction(adminId, 'SUSPEND_SHOP', shopId, {
      oldStatus: !newStatus,
      newStatus: newStatus,
      action: newStatus ? 'Activated' : 'Suspended',
    });

    return { success: true, isActive: newStatus };
  }

  async getAllPlans() {
    return this.db.planConfig.findMany({
      orderBy: { monthlyPrice: 'asc' },
    });
  }

  async updatePlanConfig(id: string, data: any, adminId: string) {
    const updated = await this.db.planConfig.update({
      where: { id },
      data,
    });

    await this.logAction(adminId, 'UPDATE_PLAN_CONFIG', id, data);
    return updated;
  }

  async createPlanConfig(data: any, adminId: string) {
    const existing = await this.db.planConfig.findUnique({
      where: { plan: data.plan },
    });
    if (existing) {
      throw new Error(`PlanConfig for ${data.plan} already exists`);
    }
    const created = await this.db.planConfig.create({ data });
    await this.logAction(adminId, 'CREATE_PLAN_CONFIG', created.id, data);
    return created;
  }

  async deletePlanConfig(id: string, adminId: string) {
    const deleted = await this.db.planConfig.delete({ where: { id } });
    await this.logAction(adminId, 'DELETE_PLAN_CONFIG', id, {
      plan: deleted.plan,
    });
    return deleted;
  }

  async logAction(
    adminId: string,
    action: string,
    targetId: string,
    details: any,
  ) {
    return this.db.auditLog.create({
      data: {
        adminId,
        action,
        targetId,
        details: details, // Prisma JSON
      },
    });
  }

  async getEmailPresets() {
    return this.db.emailPreset.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async applyEmailPreset(id: string, adminId: string) {
    const preset = await this.db.emailPreset.findUnique({
      where: { id },
    });

    if (!preset) throw new Error('Preset not found');

    const updated = await this.db.systemConfig.update({
      where: { id: 'global_config' },
      data: {
        globalEmailTemplate: preset.globalEmailTemplate,
        welcomeEmailSubject: preset.welcomeEmailSubject,
        welcomeEmailBody: preset.welcomeEmailBody,
        newOrderEmailSubject: preset.newOrderEmailSubject,
        newOrderEmailBody: preset.newOrderEmailBody,
        lowStockEmailSubject: preset.lowStockEmailSubject,
        lowStockEmailBody: preset.lowStockEmailBody,
        adminAlertEmailSubject: preset.adminAlertEmailSubject,
        adminAlertEmailBody: preset.adminAlertEmailBody,
      },
    });

    await this.logAction(adminId, 'APPLY_EMAIL_PRESET', id, {
      name: preset.name,
    });
    return updated;
  }

  async getPendingDeletions() {
    return this.db.shop.findMany({
      where: {
        isDeletionScheduled: true,
        deletionApproved: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        ownerName: true,
        deletionScheduledAt: true,
        deletionReason: true,
        _count: {
          select: {
            orders: true,
            products: true,
            users: true,
          },
        },
      },
      orderBy: {
        deletionScheduledAt: 'desc',
      },
    });
  }

  async approveDeletion(shopId: string, adminId: string) {
    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) throw new Error('Shop not found');
    if (!shop.isDeletionScheduled)
      throw new Error('Shop not scheduled for deletion');

    // We can use ShopService's permanentlyDelete if we inject it,
    // or just implement the logic here. Given permanenlyDelete is complex,
    // I'll assume we want to keep it in ShopService and call it if possible,
    // but SuperAdminService doesn't have it injected.
    // I'll add a call to log before proceeding.

    await this.logAction(adminId, 'APPROVE_DELETION', shopId, {
      shopName: shop.name,
      reason: shop.deletionReason,
    });

    // Instead of re-implementing, I'll update the shop record to marked as approved
    // and let the existing (or future) cleanup worker handle it,
    // OR I just call the hard-delete logic now.
    // The user said "let superadmin approve it then delete it".
    // I will implement the hard delete here by calling a helper or just implementing it.

    // For consistency with ShopService.permanentlyDelete, I'll move that logic to a shared place if needed,
    // but for now I'll just implement the hard delete here using the same transaction logic.

    return this.db.$transaction(async (tx) => {
      await tx.aiInsight.deleteMany({ where: { shopId } });
      await tx.orderItem.deleteMany({ where: { order: { shopId } } });
      await tx.order.deleteMany({ where: { shopId } });
      await tx.payment.deleteMany({ where: { shopId } });
      await tx.message.deleteMany({ where: { conversation: { shopId } } });
      await tx.conversation.deleteMany({ where: { shopId } });
      await tx.usageLog.deleteMany({ where: { shopId } });
      await tx.tokenUsage.deleteMany({ where: { shopId } });
      await tx.comment.deleteMany({ where: { shopId } });
      await tx.post.deleteMany({ where: { shopId } });
      await tx.campaign.deleteMany({ where: { shopId } });
      await tx.knowledgeBase.deleteMany({ where: { shopId } });
      await tx.product.deleteMany({ where: { shopId } });
      await tx.customer.deleteMany({ where: { shopId } });
      await tx.notification.deleteMany({ where: { user: { shopId } } });
      await tx.user.deleteMany({ where: { shopId } });
      return tx.shop.delete({ where: { id: shopId } });
    });
  }

  async rejectDeletion(shopId: string, adminId: string) {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new Error('Shop not found');

    await this.logAction(adminId, 'REJECT_DELETION', shopId, {
      shopName: shop.name,
    });

    return this.db.shop.update({
      where: { id: shopId },
      data: {
        isDeletionScheduled: false,
        deletionScheduledAt: null,
        deletionReason: null,
        deletionApproved: false,
      },
    });
  }
}
