import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiService, AiResponse } from '../ai/ai.service';
import { OrderService } from '../order/order.service';
import { VoiceService } from '../voice/voice.service';
import { DatabaseService } from '../database/database.service';
import { FacebookService } from '../facebook/facebook.service';
import * as crypto from 'crypto';

interface FacebookEvent {
    object: string;
    entry: Array<{
        id: string;
        messaging?: Array<{
            sender: { id: string };
            message?: {
                text?: string;
                attachments?: Array<{
                    type: string;
                    payload: { url: string };
                }>;
            };
        }>;
        changes?: Array<{
            field: string;
            value: {
                item: string;
                verb: string;
                comment_id: string;
                post_id: string;
                sender_id: string;
                sender_name: string;
                message: string;
                parent_id?: string;
            };
        }>;
    }>;
}

@Processor('chat-queue')
export class WebhookProcessor extends WorkerHost {
    // Nudge: Service updated to recognize Post and Comment models
    private readonly logger = new Logger(WebhookProcessor.name);

    constructor(
        private readonly aiService: AiService,
        private readonly orderService: OrderService,
        private readonly voiceService: VoiceService,
        private readonly db: DatabaseService,
        private readonly facebookService: FacebookService,
    ) {
        super();
    }

    async process(job: Job<FacebookEvent, any, string>): Promise<any> {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);
        const event: FacebookEvent = job.data;

        if (event.object === 'page') {
            for (const entry of event.entry) {
                const pageId = entry.id;

                const shop = await this.db.shop.findFirst({
                    where: { pageId },
                });

                if (!shop) {
                    this.logger.warn(`Received event for unknown Page ID: ${pageId}`);
                    continue;
                }

                // 1. Handle Messages (Private)
                await this.handleMessagingEvents(entry.messaging || [], shop, pageId);

                // 2. Handle Feed (Public Comments)
                await this.handleFeedEvents(entry.changes || [], shop);
            }
        }
        return {};
    }

    private async handleFeedEvents(changes: any[], shop: any) {
        for (const change of changes) {
            if (change.field === 'feed' && change.value.item === 'comment' && change.value.verb === 'add') {
                const { comment_id, post_id, message } = change.value;
                const sender_id = change.value.from?.id;
                const sender_name = change.value.from?.name;

                // Avoid replying to ourselves (the page itself)
                if (sender_id === shop.pageId) {
                    this.logger.log(`Ignoring comment from Page itself (${sender_name})`);
                    continue;
                }

                this.logger.log(`New comment on post ${post_id} from ${sender_name}: ${message}`);

                // Check AI Config
                const aiConfig = shop.aiConfig as any;
                if (aiConfig && aiConfig.enableCommentAi === false) {
                    this.logger.log(`AI for comments is disabled for shop ${shop.id}. Skipping.`);
                    continue;
                }

                try {
                    // 1. Get or Create Post
                    const post = await this.db.post.upsert({
                        where: { facebookId: post_id },
                        update: {},
                        create: {
                            facebookId: post_id,
                            shopId: shop.id,
                            content: 'Facebook Post',
                        },
                    });

                    // 2. Save Comment
                    const comment = await this.db.comment.create({
                        data: {
                            facebookId: comment_id,
                            postId: post.id,
                            shopId: shop.id,
                            senderName: sender_name,
                            senderPsid: sender_id,
                            content: message,
                        },
                    });

                    // 3. Generate AI Response (Structured)
                    const aiResult = await this.aiService.processComment(
                        message,
                        post.content || '',
                        shop
                    );

                    const { publicReply, privateReply, shouldSendDm } = aiResult;

                    // 4. Send Public Reply
                    await this.facebookService.replyToComment(comment_id, publicReply, shop.accessToken);

                    // 5. Send Private DM (if requested by AI)
                    if (shouldSendDm && privateReply) {
                        const success = await this.facebookService.sendPrivateReply(comment_id, privateReply, shop.accessToken);

                        // Fallback to standard message if private_reply endpoint fails
                        if (!success) {
                            this.logger.log(`Falling back to direct message for user ${sender_id}`);
                            await this.facebookService.sendMessage(sender_id, privateReply, shop.accessToken, shop.pageId);
                        }
                    }

                    // 6. Update Comment with Reply
                    await this.db.comment.update({
                        where: { id: comment.id },
                        data: {
                            aiReply: publicReply,
                            status: 'REPLIED',
                        },
                    });

                } catch (error) {
                    this.logger.error(`Error processing comment ${comment_id}`, error);
                }
            } else {
                this.logger.warn(`🔍 Received non-comment feed event: ${JSON.stringify(change)}`);
            }
        }
    }

    private async handleMessagingEvents(messagingEvents: any[], shop: any, pageId: string) {
        for (const messaging of messagingEvents) {
            let userMessage = '';

            if (messaging.message && messaging.message.text) {
                userMessage = messaging.message.text;
            }

            if (messaging.message && messaging.message.attachments) {
                for (const attachment of messaging.message.attachments) {
                    if (attachment.type === 'audio') {
                        const transcription = await this.voiceService.transcribeAudio(
                            attachment.payload.url,
                        );
                        userMessage = `[Voice Note Transcribed]: ${transcription}`;

                        // Usage Logging
                        await this.db.usageLog.create({
                            data: { id: crypto.randomUUID(), shopId: shop.id, type: 'VOICE_WHISPER' },
                        });
                    }
                }
            }

            if (userMessage) {
                this.logger.log(`User says (Page: ${pageId}): ${userMessage}`);

                const aiConfig = shop.aiConfig as any;
                if (aiConfig && aiConfig.enableChatAi === false) {
                    this.logger.log(`AI for chats is disabled for shop ${shop.id}. Skipping.`);
                    continue;
                }

                try {
                    // 1. Get or Create Customer (CRM)
                    const customer = await this.db.customer.upsert({
                        where: {
                            shopId_psid: {
                                shopId: shop.id,
                                psid: messaging.sender.id,
                            },
                        },
                        update: {},
                        create: {
                            shopId: shop.id,
                            psid: messaging.sender.id,
                            name: 'Messenger User',
                        },
                    });

                    // 2. Get or Create Conversation
                    const conversation = await this.db.conversation.upsert({
                        where: {
                            shopId_psid: {
                                shopId: shop.id,
                                psid: messaging.sender.id,
                            },
                        },
                        update: {},
                        create: {
                            shopId: shop.id,
                            psid: messaging.sender.id,
                        },
                    });

                    // 3. Save User Message
                    await this.db.message.create({
                        data: {
                            conversationId: conversation.id,
                            sender: 'USER',
                            content: userMessage,
                            type: 'TEXT',
                        },
                    });

                    // 4. Fetch History (last 10 messages)
                    const historyMsgs = await this.db.message.findMany({
                        where: { conversationId: conversation.id },
                        orderBy: { createdAt: 'desc' },
                        take: 11,
                    });

                    const history = historyMsgs
                        .reverse()
                        .slice(0, -1)
                        .map((m: any) => ({
                            role: (m.sender === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
                            content: m.content,
                        }));

                    // 5. Get AI Response (Structured)
                    const aiResponse: AiResponse = await this.aiService.processMessage(
                        userMessage,
                        shop,
                        history,
                    );

                    await this.db.usageLog.create({
                        data: { id: crypto.randomUUID(), shopId: shop.id, type: 'MESSAGE_AI' },
                    });

                    let responseText = aiResponse.reply_message;
                    const intent = aiResponse.intent;

                    try {
                        // NEW LOGIC: Intent-Based Handling
                        if (intent === 'CHECK_STATUS') {
                            const phone = aiResponse.data.phone;
                            const orderId = aiResponse.data.order_id;
                            let order;

                            if (orderId) {
                                order = await this.orderService.findOne(orderId, shop.id);
                            } else if (phone) {
                                order = await this.orderService.findRecentByPhone(phone, shop.id);
                            }

                            if (order) {
                                responseText = `📦 Status: ${order.status}\n`;
                                if (order.trackingId) responseText += `🚚 Tracking ID: ${order.trackingId}\n`;
                                if (order.courierName) responseText += `🚚 Courier: ${order.courierName}\n`;
                                responseText += `\nTotal: ${order.totalPrice} BDT`;
                            } else {
                                responseText = "Sorry, I couldn't find an order with that information. Please check the Order ID or Phone Number.";
                            }

                            await this.db.usageLog.create({
                                data: { id: crypto.randomUUID(), shopId: shop.id, type: 'CHECK_STATUS' },
                            });

                        } else if (intent === 'CREATE_ORDER') {
                            // Extract extracted data with fallbacks
                            const customerName = aiResponse.data.customer_name;
                            const customerPhone = aiResponse.data.phone;
                            const customerAddress = aiResponse.data.address;
                            // Items can be an object or string depending on AI, we standardized to object in interface but need to handle flexibility
                            const rawItems = aiResponse.data.items;
                            let items = [];

                            if (Array.isArray(rawItems)) {
                                items = rawItems;
                            } else if (typeof rawItems === 'string') {
                                items = [{ product_name: rawItems, quantity: 1 }];
                            }

                            // Use confirmation message if available
                            if (aiResponse.confirmation_message) {
                                responseText = aiResponse.confirmation_message;
                            }

                            // VALIDATION: Check for missing fields
                            const missingFields = [];
                            // Strict check for null, "null", "Unknown" or empty string
                            if (!customerName || customerName === 'Unknown' || customerName === 'null') missingFields.push('Name');
                            if (!customerPhone || customerPhone === 'Unknown' || customerPhone === 'null') missingFields.push('Phone Number');
                            if (!customerAddress || customerAddress === 'Unknown' || customerAddress === 'null') missingFields.push('Address');
                            if (!items || items.length === 0) missingFields.push('Items');

                            if (missingFields.length > 0) {
                                this.logger.warn(`⚠️ AI tried to create incomplete order. Downgrading to Chat. Missing: ${missingFields.join(', ')}`);
                                responseText = `Order confirm korar jonno kindly apnar **Name**, **Phone Number** ebong **Address** ta din?`;

                                // Override response text to ask for missing info, ignoring AI's confirmation message
                                await this.facebookService.sendMessage(messaging.sender.id, responseText, shop.accessToken, pageId);

                                // Log the partial attempt
                                await this.db.message.create({
                                    data: {
                                        conversationId: conversation.id,
                                        sender: 'BOT',
                                        content: responseText,
                                        type: 'TEXT',
                                    },
                                });
                                continue; // Skip the rest of order creation
                            }

                            // Update Customer
                            if (customerName) {
                                await this.db.customer.update({
                                    where: { id: customer.id },
                                    data: {
                                        name: customerName,
                                        phone: customerPhone
                                    },
                                });
                            }

                            // Check for duplicate order
                            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                            const recentOrder = await this.db.order.findFirst({
                                where: {
                                    shopId: shop.id,
                                    createdAt: { gt: twoMinutesAgo },
                                    rawExtract: {
                                        path: ['psid'],
                                        equals: messaging.sender.id
                                    }
                                }
                            });

                            if (recentOrder && Math.abs(Number(recentOrder.totalPrice) - (aiResponse.data.total_price || 0)) < 1) {
                                this.logger.warn(`Duplicate order detected from PSID ${messaging.sender.id}. Skipping creation.`);
                                responseText = "I believe I have already placed this order! If you want to place a new one, please add 'New Order' to your message.";
                            } else {
                                // Create Order
                                const createdOrder = await this.orderService.create(
                                    {
                                        customerId: customer.id,
                                        customerName: customerName,
                                        customerPhone: customerPhone,
                                        customerAddress: customerAddress,
                                        items: JSON.stringify(items),
                                        totalPrice: aiResponse.data.total_price || 0,
                                        status: 'PENDING',
                                        psid: messaging.sender.id,
                                        source: 'AI',
                                    },
                                    shop.id,
                                );

                                await this.db.usageLog.create({
                                    data: { id: crypto.randomUUID(), shopId: shop.id, type: 'ORDER_EXTRACTED' },
                                });

                                // Generate Detailed Confirmation (Final Check)
                                const deliveryCharge = (shop.aiConfig as any)?.deliveryCharge || 100;
                                const totalAmount = Number(createdOrder.totalPrice) + Number(deliveryCharge);

                                let itemsListString = "";
                                if (Array.isArray(items)) {
                                    itemsListString = items.map((i: any) => `${i.product_name} x${i.quantity}`).join('\n- ');
                                }

                                responseText = `✅ *Order Confirmed!*\n\n` +
                                    `🆔 Order ID: #${createdOrder.id.slice(0, 8).toUpperCase()}\n` +
                                    `👤 Name: ${createdOrder.customerName}\n` +
                                    `📞 Phone: ${createdOrder.customerPhone}\n` +
                                    `📍 Address: ${createdOrder.customerAddress}\n\n` +
                                    `📦 **Items:**\n- ${itemsListString}\n\n` +
                                    `🚚 Delivery Charge: ${deliveryCharge} BDT\n` +
                                    `💰 **Total Amount:** ${totalAmount} BDT\n\n` +
                                    `💳 Payment: Cash on Delivery\n` +
                                    `Thank you for shopping with us! You will receive a tracking number shortly.`;
                            }
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to process AI intent: ${error.message}`);
                    }

                    await this.db.message.create({
                        data: {
                            conversationId: conversation.id,
                            sender: 'BOT',
                            content: responseText,
                            type: 'TEXT',
                        },
                    });

                    await this.db.conversation.update({
                        where: { id: conversation.id },
                        data: { lastMessage: userMessage },
                    });

                    await this.facebookService.sendMessage(messaging.sender.id, responseText, shop.accessToken, pageId);

                } catch (error) {
                    this.logger.error('Error in AI processing flow', error);
                }
            }
        }
    }
}
