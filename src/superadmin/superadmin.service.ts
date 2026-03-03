import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SuperAdminService {
  constructor(private readonly db: DatabaseService) { }

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
          }
        }
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
    await this.logAction(adminId, 'DELETE_PLAN_CONFIG', id, { plan: deleted.plan });
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

  async generateEmailTemplates(prompt: string) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const requestPrompt = `
You are an expert copywriter and UI designer. The user wants to generate email subjects, HTML body templates, and a matching Global HTML Wrapper for their e-commerce system.
User Request: "${prompt}"

Available variables you can use in individual bodies (do NOT use in subjects):
- #SHOP_NAME# (The name of the shop)
- #ACTION_BUTTON# (A button for the user to click - use this token exactly)
- #PRODUCT# (For low stock alerts, the product name)
- #TOTAL# (For order alerts, the order total)
- #ID# (For order alerts, the order ID)
- #EMAIL# (For admin alerts, the new shop's email)
- #ITEMS# (For order alerts, a formatted list of purchased items)

For the "globalEmailTemplate" (the wrapper), you MUST include:
- #CONTENT# (Where the individual email body will be injected)
- #LOGO_URL# (Placeholder for shop logo)
- #YEAR# (Current year)
- #DASHBOARD_URL# (Link to the dashboard)
- #SHOP_NAME# (Shop name in footer/header)

Return ONLY a valid JSON object with the following keys. The bodies should be rich, professional HTML with inline styles. Use a design that matches the user's prompt (e.g., modern, minimal, corporate, etc.).

{
  "welcomeEmailSubject": "...",
  "welcomeEmailBody": "...",
  "newOrderEmailSubject": "...",
  "newOrderEmailBody": "...",
  "lowStockEmailSubject": "...",
  "lowStockEmailBody": "...",
  "adminAlertEmailSubject": "...",
  "adminAlertEmailBody": "...",
  "globalEmailTemplate": "...(The full HTML wrapper including <html>, <head>, <body> tags and the #CONTENT# token)..."
}

Ensure the HTML is clean and compatible with most email clients. Do not include markdown codeblocks (\`\`\`json) in your response, just the raw JSON.`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: requestPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json",
        }
      });
      const responseText = result.response.text();
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to generate templates:', error);
      throw new Error('Failed to generate email templates using AI');
    }
  }
}
