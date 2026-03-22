import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AffiliateService {
  constructor(private readonly db: DatabaseService) {}

  async requestPayout(affiliateId: string, amount: number, paymentMethod: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
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
          paymentMethod,
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
                shops: { select: { id: true, name: true, renewalCount: true, createdAt: true } }
            }
          },
          payouts: { orderBy: { createdAt: 'desc' } }
        }
      });
  
      if (!affiliate || affiliate.role !== 'AFFILIATE') {
        throw new BadRequestException('Invalid affiliate user');
      }

      let lifetimeEarnings = 0;
      let totalReferrals = 0;
      let pendingValue = 0;

      const referrals = [];

      for (const promo of affiliate.promoCodes) {
          totalReferrals += promo.shops.length;
          
          for (const shop of promo.shops) {
              const shopPayments = promo.payments.filter(p => p.shopId === shop.id);
              const earnedFromShop = shopPayments.reduce((acc, p) => acc + Number(p.affiliateCommission), 0);
              referrals.push({
                  shopName: shop.name,
                  renewalCount: shop.renewalCount,
                  earned: earnedFromShop,
                  joinedAt: shop.createdAt
              });
          }

          for (const pay of promo.payments) {
              lifetimeEarnings += Number(pay.affiliateCommission);
          }
      }

      const requestedEarnings = affiliate.payouts
        .filter(p => p.status !== 'REJECTED')
        .reduce((acc, p) => acc + Number(p.amount), 0);
      
      const availableBalance = lifetimeEarnings - requestedEarnings;

      return {
          lifetimeEarnings,
          availableBalance,
          totalReferrals,
          payouts: affiliate.payouts,
          referrals
      };
  }

  async getAllPayouts() {
    return this.db.payout.findMany({
      include: {
        affiliate: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
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
}
