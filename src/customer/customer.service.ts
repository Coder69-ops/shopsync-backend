import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomerService {
    constructor(private readonly db: DatabaseService) { }

    async findAll(shopId: string) {
        return this.db.customer.findMany({
            where: { shopId },
            include: {
                _count: {
                    select: { orders: true },
                },
                orders: {
                    orderBy: { createdAt: 'desc' },
                    take: 1, // Last order
                }
            },
            orderBy: { updatedAt: 'desc' },
        });
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

    // Find by PSID or Create if not exists
    async findOrCreate(shopId: string, psid: string, name?: string) {
        return this.db.customer.upsert({
            where: {
                shopId_psid: {
                    shopId,
                    psid,
                },
            },
            update: {
                name: name || undefined,
                updatedAt: new Date(),
            },
            create: {
                shopId,
                psid,
                name,
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
}
