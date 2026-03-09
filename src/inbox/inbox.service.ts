import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FacebookService } from '../facebook/facebook.service';
import { OrderService } from '../order/order.service';
import { Sender, MessageStatus, MsgType } from '@prisma/client';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class InboxService {
    private readonly logger = new Logger(InboxService.name);

    constructor(
        private readonly db: DatabaseService,
        private readonly facebookService: FacebookService,
        private readonly orderService: OrderService,
        private readonly chatGateway: ChatGateway,
    ) { }

    async getConversations(shopId: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const [conversations, total] = await Promise.all([
            this.db.conversation.findMany({
                where: { shopId },
                include: {
                    messages: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.db.conversation.count({ where: { shopId } }),
        ]);

        // Enrich with customer data
        const enrichedConversations = await Promise.all(
            conversations.map(async (conv) => {
                const customer = await this.db.customer.findFirst({
                    where: {
                        shopId,
                        externalId: conv.psid,
                        platform: 'FACEBOOK'
                    },
                });

                const stats = await this.getCustomerStats(shopId, conv.psid);

                return {
                    ...conv,
                    customer: customer || {
                        name: conv.customerName,
                        profilePic: conv.customerAvatar,
                        email: null,
                        phone: null,
                    },
                    customerName: conv.customerName || customer?.name,
                    customerAvatar: conv.customerAvatar || customer?.profilePic,
                    stats,
                };
            }),
        );

        return {
            data: enrichedConversations,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getMessages(conversationId: string, shopId: string) {
        const conversation = await this.db.conversation.findFirst({
            where: { id: conversationId, shopId },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        return this.db.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
        });
    }

    async sendMessage(shopId: string, conversationId: string, content: string) {
        const conversation = await this.db.conversation.findUnique({
            where: { id: conversationId },
            include: { shop: true },
        });

        if (!conversation || conversation.shopId !== shopId) {
            throw new NotFoundException('Conversation not found');
        }

        const { shop } = conversation;
        if (!shop.accessToken) {
            throw new Error('Shop Facebook Page access token is missing');
        }

        // 1. Save to database first
        const message = await this.db.message.create({
            data: {
                conversationId,
                content,
                sender: Sender.USER,
                type: MsgType.TEXT,
                status: MessageStatus.PENDING,
            },
        });

        // 2. Send via Facebook
        try {
            await this.facebookService.sendMessage(
                conversation.psid,
                content,
                shop.accessToken,
            );

            // 3. Update status to SENT
            const updatedMessage = await this.db.message.update({
                where: { id: message.id },
                data: { status: MessageStatus.SENT },
            });

            // 4. Broadcast to all clients
            this.chatGateway.emitNewMessage(shopId, updatedMessage);

            return updatedMessage;
        } catch (error) {
            this.logger.error(`Failed to send FB message: ${error.message}`);
            await this.db.message.update({
                where: { id: message.id },
                data: {
                    status: MessageStatus.FAILED,
                    errorMessage: error.message
                },
            });
            throw error;
        }
    }

    async addInternalNote(conversationId: string, text: string, adminId: string) {
        const conversation = await this.db.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) throw new NotFoundException('Conversation not found');

        const admin = await this.db.user.findUnique({
            where: { id: adminId },
            select: { email: true }
        });

        const notes = (conversation.internalNotes as any[]) || [];
        notes.push({
            adminId,
            adminName: admin?.email?.split('@')[0] || 'Admin',
            text,
            createdAt: new Date(),
        });

        const updatedConversation = await this.db.conversation.update({
            where: { id: conversationId },
            data: { internalNotes: notes },
        });

        // Broadcast update
        this.chatGateway.emitConversationUpdate(conversation.shopId, updatedConversation);

        return updatedConversation;
    }

    async updateTags(conversationId: string, tags: string[]) {
        const conversation = await this.db.conversation.findUnique({
            where: { id: conversationId },
        });

        const updatedConversation = await this.db.conversation.update({
            where: { id: conversationId },
            data: { tags },
        });

        if (conversation) {
            this.chatGateway.emitConversationUpdate(conversation.shopId, updatedConversation);
        }

        return updatedConversation;
    }

    private async getCustomerStats(shopId: string, psid: string) {
        const customer = await this.db.customer.findFirst({
            where: { shopId, externalId: psid, platform: 'FACEBOOK' },
            include: {
                orders: {
                    select: { totalPrice: true, status: true },
                },
            },
        });

        if (!customer) return { totalOrders: 0, totalSpend: 0 };

        const totalSpend = customer.orders
            .filter(o => o.status !== 'CANCELLED')
            .reduce((sum, o) => sum + Number(o.totalPrice || 0), 0);

        return {
            totalOrders: customer.orders.length,
            totalSpend,
        };
    }

    async createOrder(conversationId: string, shopId: string, orderData: any) {
        const conversation = await this.db.conversation.findUnique({
            where: { id: conversationId },
        });

        if (!conversation) {
            throw new NotFoundException('Conversation not found');
        }

        return this.orderService.createOrder(
            {
                ...orderData,
                name: orderData.customerName,
                phone: orderData.customerPhone,
                address: orderData.customerAddress,
                delivery_type: orderData.delivery_type || 'inside',
                psid: conversation.psid,
                source: 'MANUAL',
            },
            shopId,
        );
    }
}
