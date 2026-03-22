import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';
import { AffiliateApplicationStatus } from '@prisma/client';
import { ApplyAffiliateDto } from './dto/apply-affiliate.dto';

import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';

@Injectable()
export class AffiliateService {
  constructor(
    private readonly db: DatabaseService,
    private readonly email: EmailService,
  ) {}

  async requestPayout(affiliateId: string, amount: number, paymentMethodId: string, payoutDetails: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const method = await this.db.payoutMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method || !method.isActive) {
      throw new BadRequestException('Invalid or inactive payout method');
    }

    return this.db.$transaction(async (tx) => {
      const affiliate = await tx.user.findUnique({ 
        where: { id: affiliateId },
        include: { 
          promoCodes: {
            include: { payments: { where: { status: 'APPROVED' } } }
          },
          payouts: { where: { status: { not: 'REJECTED' } } }
        }
      });

      if (!affiliate || affiliate.role !== 'AFFILIATE') {
        throw new BadRequestException('Invalid affiliate user');
      }

      let totalEarned = 0;
      for (const promo of affiliate.promoCodes) {
        for (const pay of promo.payments) {
          totalEarned += Number(pay.affiliateCommission);
        }
      }

      let totalRequested = 0;
      for (const payout of affiliate.payouts) {
        totalRequested += Number(payout.amount);
      }

      const availableBalance = totalEarned - totalRequested;

      if (amount > availableBalance) {
        throw new BadRequestException('Insufficient balance');
      }

      return tx.payout.create({
        data: {
          affiliateId,
          amount,
          paymentMethod: method.name, // Display name
          paymentMethodId: method.id,
          payoutDetails, // Store snapshot
          status: 'PENDING',
        }
      });
    });
  }

  async getDashboardStats(affiliateId: string) {
    const affiliate = await this.db.user.findUnique({
      where: { id: affiliateId },
      include: {
        promoCodes: {
          include: {
            payments: { where: { status: 'APPROVED' } },
            shops: { select: { id: true, name: true, renewalCount: true, createdAt: true, isRecycled: true } },
            clicks: true,
          },
        },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!affiliate || affiliate.role !== 'AFFILIATE') {
      throw new BadRequestException('Invalid affiliate user');
    }

    let lifetimeEarnings = 0;
    let totalReferrals = 0;
    let totalClicks = 0;

    const referrals = [];

    for (const promo of affiliate.promoCodes) {
      totalReferrals += promo.shops.length;
      totalClicks += promo.clicks.length;

      for (const shop of promo.shops) {
        const shopPayments = promo.payments.filter((p) => p.shopId === shop.id);
        const earnedFromShop = shopPayments.reduce((acc, p) => acc + Number(p.affiliateCommission), 0);
        referrals.push({
          shopName: shop.name,
          renewalCount: shop.renewalCount,
          earned: earnedFromShop,
          joinedAt: shop.createdAt,
        });
      }

      for (const pay of promo.payments) {
        lifetimeEarnings += Number(pay.affiliateCommission);
      }
    }

    const requestedEarnings = affiliate.payouts
      .filter((p) => p.status !== 'REJECTED')
      .reduce((acc, p) => acc + Number(p.amount), 0);

    const availableBalance = lifetimeEarnings - requestedEarnings;

    const isSecure = !affiliate.promoCodes.some((pc) =>
      pc.payments.some((p) => p.isSuspicious) || pc.shops.some((s) => s.isRecycled),
    );

    const conversionRate = totalClicks > 0 ? (totalReferrals / totalClicks) * 100 : 0;

    return {
      lifetimeEarnings,
      availableBalance,
      totalReferrals,
      totalClicks,
      conversionRate: Number(conversionRate.toFixed(2)),
      payouts: affiliate.payouts,
      referrals,
      isSecure,
    };
  }

  async trackClick(promoCode: string, ip?: string, userAgent?: string) {
    const promo = await this.db.promoCode.findUnique({
      where: { code: promoCode },
    });

    if (!promo || !promo.isActive) return null;

    return this.db.promoClick.create({
      data: {
        promoCodeId: promo.id,
        ip,
        userAgent,
      },
    });
  }

  async getAllPayouts() {
    const payouts = await this.db.payout.findMany({
      include: {
        affiliate: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            payoutDetails: true,
            promoCodes: {
              include: {
                shops: { select: { isRecycled: true } },
                payments: { where: { isSuspicious: true }, select: { id: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return payouts.map(p => {
      const hasSuspiciousPayments = p.affiliate.promoCodes.some(pc => pc.payments.length > 0);
      const hasRecycledShops = p.affiliate.promoCodes.some(pc => pc.shops.some(s => s.isRecycled));
      
      // Clean up the deep include for the response if needed, 
      // but keeping it simple for now by just adding fraudAlerts.
      return {
        ...p,
        fraudAlerts: {
          suspiciousPayment: hasSuspiciousPayments,
          recycledShop: hasRecycledShops
        }
      };
    });
  }

  async updatePayoutStatus(id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string) {
    const payout = await this.db.payout.findUnique({ where: { id } });
    if (!payout) throw new BadRequestException('Payout not found');
    if (payout.status !== 'PENDING') throw new BadRequestException('Payout is already processed');

    return this.db.payout.update({
      where: { id },
      data: { status, rejectionReason: status === 'REJECTED' ? rejectionReason : null }
    });
  }

  async getAllAffiliates() {
    const affiliates = await this.db.user.findMany({
      where: { role: 'AFFILIATE' },
      include: {
        promoCodes: {
          include: {
            shops: { select: { id: true, name: true, createdAt: true } },
            payments: { where: { status: 'APPROVED' } }
          }
        },
        payouts: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return affiliates.map(aff => {
      let lifetimeEarnings = 0;
      let totalReferrals = 0;
      
      for (const promo of aff.promoCodes) {
        totalReferrals += promo.shops.length;
        for (const pay of promo.payments) {
          lifetimeEarnings += Number(pay.affiliateCommission);
        }
      }

      const totalPaid = aff.payouts.filter(p => p.status === 'APPROVED').reduce((acc, p) => acc + Number(p.amount), 0);
      const pendingPayouts = aff.payouts.filter(p => p.status === 'PENDING').reduce((acc, p) => acc + Number(p.amount), 0);

      const availableBalance = lifetimeEarnings - totalPaid - pendingPayouts;

      return {
        id: aff.id,
        name: aff.name,
        email: aff.email,
        createdAt: aff.createdAt,
        promoCodes: aff.promoCodes,
        stats: {
          lifetimeEarnings,
          totalReferrals,
          totalPaid,
          pendingPayouts,
          availableBalance
        }
      };
    });
  }

  async createAffiliate(data: any) {
    // ... logic remains same as requested previously
    const { name, email, password, promoCode } = data;

    const existingUser = await this.db.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const existingPromo = await this.db.promoCode.findUnique({ where: { code: promoCode } });
    if (existingPromo) {
      throw new BadRequestException('Promo code already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    return this.db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'AFFILIATE',
        isActive: true, // Auto activate
        promoCodes: {
          create: {
            code: promoCode,
            discountPercent: 10,
            isActive: true
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        promoCodes: true
      }
    });
  }

  // New Methods for Ecosystem Expansion

  async updatePayoutDetails(affiliateId: string, details: any) {
    return this.db.user.update({
      where: { id: affiliateId },
      data: { payoutDetails: details }
    });
  }

  async getPayoutMethods(onlyActive: boolean = true) {
    return this.db.payoutMethod.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: { name: 'asc' }
    });
  }

  async createPayoutMethod(data: { name: string; type: string; icon?: string }) {
    return this.db.payoutMethod.create({ data });
  }

  async updatePayoutMethod(id: string, data: any) {
    return this.db.payoutMethod.update({
      where: { id },
      data
    });
  }

  async deletePayoutMethod(id: string) {
    return this.db.payoutMethod.delete({ where: { id } });
  }

  async getAffiliateProfile(id: string) {
      return this.db.user.findUnique({
          where: { id },
          select: {
              id: true,
              name: true,
              email: true,
              payoutDetails: true,
              role: true,
              createdAt: true,
              themePreference: true,
              languagePreference: true,
              profilePic: true
          }
      });
  }

  async submitApplication(dto: ApplyAffiliateDto) {
    return this.db.affiliateApplication.create({
      data: {
        ...dto,
      },
    });
  }

  async getApplications() {
    return this.db.affiliateApplication.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateApplicationStatus(id: string, status: AffiliateApplicationStatus, rejectionReason?: string) {
    const application = await this.db.affiliateApplication.findUnique({
      where: { id },
    });

    if (!application) {
      throw new BadRequestException('Application not found');
    }

    if (application.status !== 'PENDING') {
      throw new BadRequestException('Application is already ' + application.status);
    }

    return this.db.$transaction(async (tx) => {
      const updatedApp = await tx.affiliateApplication.update({
        where: { id },
        data: {
          status,
          rejectionReason,
        },
      });

      if (status === 'APPROVED') {
        // Check if user already exists
        let user = await tx.user.findUnique({
          where: { email: application.email },
        });

        if (user) {
          // If user exists, update their role to AFFILIATE
          await tx.user.update({
            where: { id: user.id },
            data: { role: 'AFFILIATE' },
          });
        } else {
          // Create new user
          const tempPassword = uuidv4();
          const hashedPassword = await bcrypt.hash(tempPassword, 10);
          
          user = await tx.user.create({
            data: {
              email: application.email,
              name: application.fullName,
              password: hashedPassword,
              role: 'AFFILIATE',
            },
          });
        }

        // Send approval email
        await this.email.sendAffiliateApproval(application.email, application.fullName);
      } else if (status === 'REJECTED') {
        // Send rejection email
        await this.email.sendAffiliateRejection(application.email, application.fullName, rejectionReason || 'আবেদনটি এই মুহূর্তে গ্রহণ করা সম্ভব হয়নি।');
      }

      return updatedApp;
    });
  }

  async getAffiliateDetailsAdmin(id: string) {
    const affiliate = await this.db.user.findUnique({
      where: { id },
      include: {
        promoCodes: {
          include: {
            shops: { select: { id: true, name: true, createdAt: true, renewalCount: true, isRecycled: true } },
            payments: { where: { status: 'APPROVED' } },
            clicks: { 
              take: 50,
              orderBy: { createdAt: 'desc' }
            },
          },
        },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!affiliate || affiliate.role !== 'AFFILIATE') {
      throw new BadRequestException('Invalid affiliate user');
    }

    let lifetimeEarnings = 0;
    let totalReferrals = 0;
    let totalClicks = 0;
    const referrals = [];
    const allRecentClicks = [];

    for (const promo of affiliate.promoCodes) {
      totalReferrals += promo.shops.length;
      
      const realClickCount = await this.db.promoClick.count({ where: { promoCodeId: promo.id } });
      totalClicks += realClickCount;

      for (const shop of promo.shops) {
        const shopPayments = promo.payments.filter((p) => p.shopId === shop.id);
        const earnedFromShop = shopPayments.reduce((acc, p) => acc + Number(p.affiliateCommission), 0);
        referrals.push({
          shopId: shop.id,
          shopName: shop.name,
          renewalCount: shop.renewalCount,
          earned: earnedFromShop,
          joinedAt: shop.createdAt,
          isRecycled: shop.isRecycled,
          promoCode: promo.code
        });
      }

      for (const pay of promo.payments) {
        lifetimeEarnings += Number(pay.affiliateCommission);
      }

      allRecentClicks.push(...promo.clicks.map(c => ({
        ...c,
        promoCode: promo.code
      })));
    }

    allRecentClicks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const totalPaid = affiliate.payouts.filter(p => p.status === 'APPROVED').reduce((acc, p) => acc + Number(p.amount), 0);
    const pendingPayouts = affiliate.payouts.filter(p => p.status === 'PENDING').reduce((acc, p) => acc + Number(p.amount), 0);
    const availableBalance = lifetimeEarnings - totalPaid - pendingPayouts;

    const conversionRate = totalClicks > 0 ? (totalReferrals / totalClicks) * 100 : 0;

    const ipCounts: Record<string, { count: number; codes: Set<string> }> = {};
    allRecentClicks.forEach(c => {
      if (c.ip) {
        const entry = ipCounts[c.ip] || { count: 0, codes: new Set() };
        entry.count += 1;
        entry.codes.add(c.promoCode);
        ipCounts[c.ip] = entry;
      }
    });

    return {
      profile: {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        createdAt: affiliate.createdAt,
        isActive: affiliate.isActive,
        payoutDetails: affiliate.payoutDetails,
        role: affiliate.role
      },
      stats: {
        lifetimeEarnings,
        availableBalance,
        totalPaid,
        pendingPayouts,
        totalReferrals,
        totalClicks,
        conversionRate: Number(conversionRate.toFixed(2)),
      },
      promoCodes: affiliate.promoCodes.map(pc => ({
        id: pc.id,
        code: pc.code,
        discountPercent: pc.discountPercent,
        isActive: pc.isActive,
        createdAt: pc.createdAt
      })),
      referrals,
      payouts: affiliate.payouts,
      fraudMonitoring: {
        suspiciousIPs: Object.entries(ipCounts)
          .filter(([_, data]) => data.count > 3)
          .map(([ip, data]) => ({
            ip,
            count: data.count,
            codes: Array.from(data.codes)
          }))
          .sort((a, b) => b.count - a.count),
        recentClicks: allRecentClicks.slice(0, 50)
      }
    };
  }

  async updateAffiliateStatus(id: string, isActive: boolean) {
    const affiliate = await this.db.user.findUnique({ where: { id } });
    if (!affiliate || affiliate.role !== 'AFFILIATE') {
      throw new BadRequestException('Affiliate not found');
    }

    return this.db.user.update({
      where: { id },
      data: { isActive }
    });
  }

  async revokePromoCode(id: string, codeId: string) {
    const promo = await this.db.promoCode.findFirst({
      where: { id: codeId, affiliateId: id }
    });

    if (!promo) {
      throw new BadRequestException('Promo code not found for this affiliate');
    }

    return this.db.promoCode.update({
      where: { id: codeId },
      data: { isActive: false }
    });
  }
}
