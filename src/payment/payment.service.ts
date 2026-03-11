import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SystemConfigService } from '../superadmin/system-config.service';
import { SuperAdminService } from '../superadmin/superadmin.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentMethodService } from './payment-method.service';
import { EmailService } from '../email/email.service';
import { startOfDay, endOfDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly systemConfigService: SystemConfigService,
    private readonly superAdminService: SuperAdminService,
    private readonly notificationService: NotificationService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly emailService: EmailService,
  ) { }

  async getMonthlyPrice(): Promise<number> {
    const config = await this.systemConfigService.getConfig();
    return config.monthlyPrice;
  }

  async getPaymentConfig() {
    const config = await this.systemConfigService.getConfig();
    const methods = await this.paymentMethodService.getAll(false);
    return {
      monthlyPrice: config.monthlyPrice,
      methods,
    };
  }

  async submitPayment(
    shopId: string,
    data: {
      amount: number;
      method: string;
      senderNumber: string;
      transactionId: string;
    },
  ) {
    // Check if TrxID already exists
    const existing = await this.db.payment.findUnique({
      where: { transactionId: data.transactionId },
    });
    if (existing) {
      throw new BadRequestException('Transaction ID already submitted');
    }

    try {
      const payment: any = await (this.db.payment as any).create({
        data: {
          shopId,
          amount: data.amount,
          method: data.method,
          senderNumber: data.senderNumber,
          transactionId: data.transactionId,
          currency: 'BDT', // Manual payments are always BDT
          status: 'PENDING',
        },
        include: { shop: true },
      });

      // Notify Merchant via Email
      if (payment.shop?.email) {
        this.emailService.sendPaymentReceived(
          payment.shop.email,
          Number(payment.amount),
          payment.transactionId,
          payment.shop.name
        ).catch(err =>
          this.logger.warn(`Failed to send payment receipt email: ${err.message}`)
        );
      }

      return payment;
    } catch (error) {
      if (error.code === 'P2003') {
        throw new BadRequestException(
          'Invalid Shop ID. Please log out and log in again.',
        );
      }
      throw error;
    }
  }

  async getHistory(shopId: string) {
    return this.db.payment.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllPayments(
    search?: string,
    status?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    return this.db.payment.findMany({
      where: {
        OR: search
          ? [
            { transactionId: { contains: search, mode: 'insensitive' } },
            { senderNumber: { contains: search, mode: 'insensitive' } },
            { shop: { name: { contains: search, mode: 'insensitive' } } },
          ]
          : undefined,
        status: status && status !== 'ALL' ? (status as any) : undefined,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { shop: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPlatformStats() {
    const [stats, totalShops, activeShops, totalUsers, recentShops] =
      await Promise.all([
        this.db.payment.groupBy({
          by: ['status'],
          _sum: { amount: true },
          _count: true,
        }),
        this.db.shop.count(),
        this.db.shop.count({ where: { isActive: true } }),
        this.db.user.count(),
        this.db.shop.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { orders: true, users: true },
            },
          },
        }),
      ]);

    const totalRevenue = stats
      .filter((s) => s.status === 'APPROVED')
      .reduce((sum, s) => sum + Number(s._sum.amount || 0), 0);

    const pendingPayments =
      stats.find((s) => s.status === 'PENDING')?._count || 0;

    return {
      totalRevenue,
      totalShops,
      activeShops,
      pendingPayments,
      totalUsers,
      totalTransactions: stats.reduce((sum, s) => sum + s._count, 0),
      recentShops,
    };
  }

  async approvePayment(id: string, adminId: string) {
    const payment = await this.db.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === 'APPROVED')
      throw new BadRequestException('Already approved');

    return this.db.$transaction(async (tx) => {
      // 1. Update Payment
      const updatedPayment = await tx.payment.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      // 2. Determine Plan & Duration logic
      const amount = Number(payment.amount);
      let plan: 'BASIC' | 'PRO' = 'BASIC'; // Default to Starter
      let durationDays = 30;

      // Heuristic for Plan (Allowing some flexibility/margin)
      if (amount >= 25000) {
        plan = 'PRO';
        durationDays = 365; // Yearly Pro
      } else if (amount >= 14000) {
        plan = 'BASIC';
        durationDays = 365; // Yearly Starter
      } else if (amount >= 2500) {
        plan = 'PRO';
        durationDays = 30; // Monthly Pro
      } else {
        plan = 'BASIC'; // Monthly Starter (default)
      }

      // 3. Calculate New End Date
      const shop = await tx.shop.findUnique({ where: { id: payment.shopId } });
      if (!shop) throw new NotFoundException('Shop not found');

      const now = new Date();
      let currentEnd = shop.subscriptionEndsAt
        ? new Date(shop.subscriptionEndsAt)
        : now;
      if (currentEnd < now) currentEnd = now;

      const newEnd = new Date(currentEnd);
      newEnd.setDate(newEnd.getDate() + durationDays);

      // 4. Update Shop
      await tx.shop.update({
        where: { id: payment.shopId },
        data: {
          plan: plan,
          subscriptionEndsAt: newEnd,
        },
      });

      // 5. Update Owner User
      await tx.user.updateMany({
        where: { shopId: payment.shopId, role: 'ADMIN' },
        data: {
          trialEndsAt: null, // Clear trial status
          isActive: true, // Ensure active
        },
      });

      // 6. Log Action
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'APPROVE_PAYMENT',
          targetId: payment.shopId,
          details: {
            paymentId: id,
            amount: amount,
            method: payment.method,
            assignedPlan: plan,
            daysAdded: durationDays,
          },
        },
      });

      // 7. Notify Admin
      const shopAdmin = await tx.user.findFirst({
        where: { shopId: payment.shopId, role: 'ADMIN' },
      });

      if (shopAdmin) {
        const planName = plan === 'PRO' ? 'Pro Business' : 'Starter';
        await this.notificationService.create({
          userId: shopAdmin.id,
          title: 'Payment Approved! 🎉',
          body: `Your payment of ${amount} BDT is approved. You are now on the **${planName}** plan for ${durationDays} days.`,
          type: 'PAYMENT_APPROVED', // Frontend listens to this
          link: '/dashboard',
        });
      }

      // 8. Notify Merchant via Email
      if (shop.email) {
        this.emailService.sendSubscriptionActivated(
          shop.email,
          plan === 'PRO' ? 'ShopSync Pro' : 'ShopSync Starter'
        ).catch(err =>
          this.logger.warn(`Failed to send subscription activation email: ${err.message}`)
        );
      }

      return updatedPayment;
    });
  }

  async rejectPayment(id: string, reason: string, adminId: string) {
    const payment = await this.db.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING')
      throw new BadRequestException('Can only reject pending payments');

    const updatedPayment = await this.db.payment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
      },
    });

    // Audit Logging
    await this.superAdminService.logAction(
      adminId,
      'REJECT_PAYMENT',
      payment.shopId,
      {
        paymentId: id,
        reason,
        amount: Number(payment.amount),
      },
    );

    // Create In-App Notification
    const shopAdmin = await this.db.user.findFirst({
      where: { shopId: payment.shopId, role: 'ADMIN' },
    });

    if (shopAdmin) {
      await this.notificationService.create({
        userId: shopAdmin.id,
        title: 'Payment Rejected ❌',
        body: `Reason: ${reason}. Please check TrxID and try again.`,
        type: 'PAYMENT_REJECTED',
        link: '/billing',
      });
    }

    // NEW: Notify Merchant via Email
    const shop = await this.db.shop.findUnique({ where: { id: payment.shopId } });
    if (shop?.email) {
      this.emailService.sendPaymentRejected(shop.email, reason).catch(err =>
        this.logger.warn(`Failed to send payment rejection email: ${err.message}`)
      );
    }

    return updatedPayment;
  }
}
