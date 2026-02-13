import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CourierService } from '../courier/courier.service';
import { FacebookService } from '../facebook/facebook.service';
import { CustomerService } from '../customer/customer.service';
import * as crypto from 'crypto';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly courierService: CourierService,
        private readonly facebookService: FacebookService,
        private readonly customerService: CustomerService,
    ) { }

    async create(data: any, shopId: string) {
        // Map the incoming DTO/Interface to the CreateOrder logic
        return this.createOrder(
            {
                name: data.customerName,
                phone: data.customerPhone,
                address: data.customerAddress || 'Unknown Address',
                items: data.items,
                totalPrice: data.totalPrice,
                status: data.status,
                psid: data.psid,
                rawExtract: data,
                source: data.source || 'MANUAL',
            },
            shopId,
        );
    }

    async createOrder(data: any, shopId: string) {
        this.logger.log(
            `Creating order for shop ${shopId} with data: ` + JSON.stringify(data),
        );

        let totalPrice = Number(data.totalPrice) || 0;
        let itemsString = data.items;

        // 0. Handle Inventory Extraction if items is an array
        if (Array.isArray(data.items) && data.items.length > 0) {
            const formattedItems: string[] = [];
            let calculatedTotal = 0;

            // Use transaction to ensure stock consistency
            await this.db.$transaction(async (tx: any) => {
                for (const item of data.items) {
                    if (!item.productId) continue;

                    const product = await tx.product.findUnique({
                        where: { id: item.productId },
                    });

                    if (!product) {
                        throw new Error(`Product not found: ${item.productId}`);
                    }

                    if (product.shopId !== shopId) {
                        throw new Error(`Product ${product.name} does not belong to this shop`);
                    }

                    if (product.stock < item.quantity) {
                        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
                    }

                    // Deduct Stock
                    await tx.product.update({
                        where: { id: product.id },
                        data: { stock: product.stock - item.quantity },
                    });

                    // Add to formatted list
                    formattedItems.push(`${item.quantity}x ${product.name}`);

                    // Add to total price
                    calculatedTotal += (Number(product.price) * item.quantity);
                }
            });

            // If we successfully processed inventory items
            if (formattedItems.length > 0) {
                itemsString = JSON.stringify(formattedItems);
                // Override total price if not manually provided (or always override?)
                // Let's trust the calculated total if inventory items were used
                totalPrice = calculatedTotal;
            }
        } else if (typeof data.items === 'string') {
            // Fallback for manual text input or AI
            itemsString = data.items;
        }


        // 1. Create Order in DB
        const order = await this.db.order.create({
            data: {
                id: crypto.randomUUID(),
                shopId: shopId,
                customerName: data.name,
                customerPhone: data.phone,
                customerAddress: data.address,
                items: itemsString,
                totalPrice: totalPrice,
                // Ensure PSID is preserved in rawExtract
                rawExtract: { ...data, psid: data.psid },
                status: 'CONFIRMED',
                source: data.source || 'MANUAL',
            },
        });

        // 1.5 Link to Customer (CRM)
        if (data.psid) {
            try {
                const customer = await this.customerService.findOrCreate(shopId, data.psid, data.name);
                await this.db.order.update({
                    where: { id: order.id },
                    data: { customerId: customer.id },
                });
            } catch (e) {
                this.logger.error('Failed to link customer', e);
            }
        }
        // Try linking by phone if no PSID
        else if (data.phone) {
            // Optional: Implementation for phone-based linking could go here
        }

        // 2. Push to Courier (Mock)
        try {
            const shipment = await this.courierService.createShipment(order);

            // 3. Update Order with Tracking Info
            await this.db.order.update({
                where: { id: order.id },
                data: {
                    trackingId: shipment.trackingId,
                    courierName: shipment.courier,
                    shipmentStatus: shipment.status,
                },
            });
            this.logger.log(
                `Order ${order.id} updated with tracking ${shipment.trackingId}`,
            );
        } catch (e) {
            this.logger.error('Failed to create shipment', e);
        }

        return order;
    }

    async findAll(shopId: string) {
        return this.db.order.findMany({
            where: { shopId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string, shopId: string) {
        return this.db.order.findFirst({
            where: { id, shopId },
        });
    }

    async findRecentByPhone(phone: string, shopId: string) {
        // Normalize phone: remove non-digits, take last 11 digits
        const normalized = phone.replace(/\D/g, '').slice(-11);

        return this.db.order.findFirst({
            where: {
                shopId,
                customerPhone: { contains: normalized } // Simple fuzzy match
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async update(id: string, data: any, shopId: string) {
        const order = await this.findOne(id, shopId);
        if (!order) return null;

        const updateData = { ...data };
        if (updateData.totalPrice !== undefined) {
            updateData.totalPrice = Number(updateData.totalPrice);
        }

        const updatedOrder = await this.db.order.update({
            where: { id },
            data: updateData,
        });

        // Notify User if Status Changed
        if (data.status && data.status !== order.status) {
            const rawData = order.rawExtract as any;
            if (rawData && rawData.psid) {
                const shop = await this.db.shop.findUnique({ where: { id: shopId } });
                if (shop) {
                    let message = `📦 Order Update: #${order.id.slice(0, 8).toUpperCase()}\nStatus: ${data.status}`;
                    if (updatedOrder.trackingId) {
                        message += `\nTracking ID: ${updatedOrder.trackingId}`;
                    }
                    await this.facebookService.sendMessage(
                        rawData.psid,
                        message,
                        shop.accessToken || ''
                    );
                }
            }
        }
        return updatedOrder;
    }

    async getMetrics(shopId: string) {
        const orders = await this.db.order.findMany({
            where: { shopId },
        });

        const totalRevenue = orders.reduce(
            (sum: number, o: any) => sum + (Number(o.totalPrice) || 0),
            0,
        );
        const activeOrders = orders.filter(
            (o: any) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
        ).length;

        // Recent 5 orders for dashboard
        const recentOrders = orders.slice(0, 5);

        // Calculate Monthly Revenue (Last 6 Months)
        const revenueChart = new Array(6).fill(0).map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return { month: d.toLocaleString('default', { month: 'short' }), value: 0 };
        }).reverse();

        orders.forEach((o: any) => {
            const date = new Date(o.createdAt);
            const now = new Date();
            const diffMonths = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
            if (diffMonths >= 0 && diffMonths < 6) {
                revenueChart[5 - diffMonths].value += (Number(o.totalPrice) || 0);
            }
        });

        return {
            totalRevenue,
            activeOrders,
            totalOrders: orders.length,
            recentOrders,
            revenueChart,
        };
    }

    async remove(id: string, shopId: string) {
        return this.db.order.deleteMany({
            where: { id, shopId },
        });
    }
}
