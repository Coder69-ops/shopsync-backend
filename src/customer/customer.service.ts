import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomerService {
  constructor(private readonly db: DatabaseService) { }

  async findAll(shopId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.db.customer.findMany({
        where: { shopId },
        include: {
          _count: {
            select: { orders: true },
          },
          orders: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.customer.count({ where: { shopId } }),
    ]);

    const formattedCustomers = customers.map((customer) => {
      const spent = customer.orders
        .filter((o: any) => o.status !== 'CANCELLED')
        .reduce((sum: number, o: any) => sum + Number(o.totalPrice || 0), 0);

      const lastOrder = customer.orders.length > 0 ? [customer.orders[0]] : [];

      return {
        ...customer,
        orders: lastOrder,
        spent,
      };
    });

    return {
      data: formattedCustomers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, shopId: string) {
    return this.db.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  // Find by External ID or Create if not exists
  async findOrCreate(shopId: string, psid: string, name?: string, email?: string) {
    return this.db.customer.upsert({
      where: {
        shopId_externalId_platform: {
          shopId,
          externalId: psid,
          platform: 'FACEBOOK',
        },
      },
      update: {
        name: name || undefined,
        email: email || undefined,
        updatedAt: new Date(),
      },
      create: {
        shopId,
        externalId: psid,
        platform: 'FACEBOOK',
        name,
        email,
      },
    });
  }

  async update(id: string, shopId: string, data: any) {
    // Ensure customer belongs to shop
    const customer = await this.db.customer.findFirst({
      where: { id, shopId },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    return this.db.customer.update({
      where: { id },
      data,
    });
  }

  async getStats(shopId: string) {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalCustomers,
      currentMonthCustomers,
      lastMonthCustomers,
      repeatsData,
      withOrdersCount,
      revenueResult,
    ] = await Promise.all([
      this.db.customer.count({ where: { shopId } }),
      this.db.customer.count({
        where: {
          shopId,
          createdAt: { gte: startOfCurrentMonth },
        },
      }),
      this.db.customer.count({
        where: {
          shopId,
          createdAt: {
            gte: startOfLastMonth,
            lt: startOfCurrentMonth,
          },
        },
      }),
      // Count repeat customers (orders > 0 and group by customerId)
      this.db.order.groupBy({
        by: ['customerId'],
        where: {
          shopId,
          customerId: { not: null },
        },
        _count: { _all: true },
        having: {
          customerId: {
            _count: { gt: 1 },
          },
        },
      }),
      // Count total unique customers who have made an order
      this.db.order.groupBy({
        by: ['customerId'],
        where: {
          shopId,
          customerId: { not: null },
        },
      }),
      // Aggregate total revenue for the shop
      this.db.order.aggregate({
        where: { shopId, status: { not: 'CANCELLED' } },
        _sum: { totalPrice: true }
      }),
    ]);

    const repeats = repeatsData.length;
    const withOrders = withOrdersCount.length;
    const totalRevenue = Number(revenueResult._sum.totalPrice || 0);

    const growthRate =
      lastMonthCustomers > 0
        ? ((currentMonthCustomers - lastMonthCustomers) / lastMonthCustomers) *
        100
        : currentMonthCustomers > 0
          ? 100
          : 0;

    return {
      totalCustomers,
      growthRate,
      repeatCustomers: repeats,
      retentionRate: withOrders > 0 ? (repeats / withOrders) * 100 : 0,
      totalRevenue,
      avgLtv: withOrders > 0 ? totalRevenue / withOrders : 0,
    };
  }
}
