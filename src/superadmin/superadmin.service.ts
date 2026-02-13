import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SuperadminService {
  constructor(private db: DatabaseService) { }

  async getStats() {
    const totalShops = await this.db.shop.count();
    const totalUsers = await this.db.user.count();
    const totalOrders = await this.db.order.count();

    const orders = await this.db.order.findMany({
      select: { totalPrice: true, createdAt: true },
    });

    const totalRevenue = orders.reduce(
      (sum, o) => sum + (Number(o.totalPrice) || 0),
      0,
    );

    // Calculate Revneue Trends (Last 6 Months)
    const revenueByMonth = new Array(6).fill(0).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return { month: d.toLocaleString('default', { month: 'short' }), amount: 0 };
    }).reverse();

    orders.forEach(o => {
      const date = new Date(o.createdAt);
      const now = new Date();
      // Check if within last 6 months
      const diffMonths = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
      if (diffMonths >= 0 && diffMonths < 6) {
        revenueByMonth[5 - diffMonths].amount += (Number(o.totalPrice) || 0);
      }
    });

    return {
      totalShops,
      totalUsers,
      totalOrders,
      totalRevenue,
      revenueByMonth,
    };
  }

  async getShops() {
    return this.db.shop.findMany({
      include: {
        _count: {
          select: {
            users: true,
            orders: true,
            products: true,
            usageLogs: true,
          },
        },
      },
    });
  }
}
