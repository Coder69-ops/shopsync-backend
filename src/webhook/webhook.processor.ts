import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AiService, AiResponse } from '../ai/ai.service';
import { OrderService } from '../order/order.service';
import { VoiceService } from '../voice/voice.service';
import { DatabaseService } from '../database/database.service';
import { FacebookService } from '../facebook/facebook.service';
import { UsageService } from '../usage/usage.service';
import { ChatGateway } from '../inbox/chat.gateway';
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

@Processor('chat-queue', {
  limiter: {
    max: process.env.AI_RATE_LIMIT_MAX
      ? parseInt(process.env.AI_RATE_LIMIT_MAX, 10)
      : 290,
    duration: process.env.AI_RATE_LIMIT_DURATION
      ? parseInt(process.env.AI_RATE_LIMIT_DURATION, 10)
      : 60000,
  },
})
export class WebhookProcessor extends WorkerHost {
  // Nudge: Service updated to recognize Post and Comment models
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly aiService: AiService,
    private readonly orderService: OrderService,
    private readonly voiceService: VoiceService,
    private readonly db: DatabaseService,
    private readonly facebookService: FacebookService,
    private readonly usageService: UsageService,
    private readonly chatGateway: ChatGateway,
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
          where: {
            platformIds: {
              path: ['facebook'],
              equals: pageId,
            },
          },
        });

        if (!shop) {
          this.logger.warn(`Received event for unknown Page ID: ${pageId}`);
          continue;
        }

        // 1. Handle Messages (Private)
        await this.handleMessagingEvents(entry.messaging || [], shop, pageId);

        // 2. Handle Feed (Public Comments)
        await this.handleFeedEvents(entry.changes || [], shop, pageId);
      }
    }
    return {};
  }

  private async handleFeedEvents(changes: any[], shop: any, pageId: string) {
    if (!shop.accessToken) {
      this.logger.warn(
        `Shop ${shop.id} missing Facebook page access token; skipping feed events`,
      );
      return;
    }

    for (const change of changes) {
      if (
        change.field === 'feed' &&
        change.value.item === 'comment' &&
        change.value.verb === 'add'
      ) {
        const { comment_id, post_id, message } = change.value;
        const sender_id = change.value.from?.id;
        const sender_name = change.value.from?.name;

        // Avoid replying to ourselves (the page itself)
        if (sender_id === pageId) {
          this.logger.log(`Ignoring comment from Page itself (${sender_name})`);
          continue;
        }

        this.logger.log(
          `New comment on post ${post_id} from ${sender_name}: ${message}`,
        );

        // Check AI Config
        const aiConfig = shop.aiConfig;
        if (aiConfig && aiConfig.enableCommentAi === false) {
          this.logger.log(
            `AI for comments is disabled for shop ${shop.id}. Skipping.`,
          );
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

          const canReply = await this.usageService.canSendMessage(
            shop.id,
            shop,
          );
          if (!canReply) {
            this.logger.warn(
              `Shop ${shop.id} message limit reached. Skipping comment reply.`,
            );
            continue;
          }

          // 3. Generate AI Response (Structured)
          const aiResult = await this.aiService.processComment(
            message,
            post.content || '',
            shop,
          );

          const { publicReply, privateReply, shouldSendDm } = aiResult;

          if (
            aiResult.thought !== 'Fallback due to error' &&
            aiResult.thought !== 'Trial Expired'
          ) {
            await this.db.usageLog.create({
              data: {
                id: crypto.randomUUID(),
                shopId: shop.id,
                type: 'MESSAGE_AI',
              },
            });
          }

          // Branding for Basic Plan
          const removeWatermark = await this.usageService.hasFeatureAccess(
            shop.id,
            'removeWatermark',
            shop,
          );
          let finalPublicReply = publicReply;

          if (!removeWatermark) {
            finalPublicReply += '\n\n⚡ Powered by ShopSync Ai';
          }

          // 4. Send Public Reply
          await this.facebookService.replyToComment(
            comment_id,
            finalPublicReply,
            shop.accessToken,
          );

          // 5. Send Private DM (if requested by AI)
          if (shouldSendDm && privateReply) {
            const success = await this.facebookService.sendPrivateReply(
              comment_id,
              privateReply,
              shop.accessToken,
            );

            // Fallback to standard message if private_reply endpoint fails
            if (!success) {
              this.logger.log(
                `Falling back to direct message for user ${sender_id}`,
              );
              await this.facebookService.sendMessage(
                sender_id,
                privateReply,
                shop.accessToken,
                pageId,
              );
            }
          }

          // 6. Update Comment with Reply
          await this.db.comment.update({
            where: { id: comment.id },
            data: {
              aiReply: finalPublicReply,
              status: 'REPLIED',
            },
          });
        } catch (error) {
          this.logger.error(`Error processing comment ${comment_id}`, error);
        }
      } else {
        this.logger.warn(
          `🔍 Received non-comment feed event: ${JSON.stringify(change)}`,
        );
      }
    }
  }

  private async handleMessagingEvents(
    messagingEvents: any[],
    shop: any,
    pageId: string,
  ) {
    if (!shop.accessToken) {
      this.logger.warn(
        `Shop ${shop.id} missing Facebook page access token; skipping messaging events`,
      );
      return;
    }

    for (const messaging of messagingEvents) {
      // 0. Avoid replying to ourselves (echoes or self-messages)
      if (messaging.message?.is_echo || messaging.sender?.id === pageId) {
        continue;
      }

      let userMessage = '';

      if (messaging.message && messaging.message.text) {
        userMessage = messaging.message.text;
      }

      if (messaging.message && messaging.message.attachments) {
        for (const attachment of messaging.message.attachments) {
          if (attachment.type === 'audio') {
            // Check Plan Permission for Voice-to-Text (Pro Only)
            const canUseVoice = await this.usageService.hasFeatureAccess(
              shop.id,
              'canUseVoiceAI',
              shop,
            );
            if (!canUseVoice) {
              this.logger.log(
                `Shop ${shop.id} attempted Voice-to-Text but access is denied.`,
              );
              await this.facebookService.sendMessage(
                messaging.sender.id,
                'Voice notes are a Pro feature. Please upgrade to Pro Business plan to unlock Voice-to-Text AI.',
                shop.accessToken,
                pageId,
              );
              continue; // Skip transcription
            }

            const transcription = await this.voiceService.transcribeAudio(
              attachment.payload.url,
            );
            userMessage = `[Voice Note Transcribed]: ${transcription}`;

            // Usage Logging
            await this.db.usageLog.create({
              data: {
                id: crypto.randomUUID(),
                shopId: shop.id,
                type: 'VOICE_WHISPER',
              },
            });
          }
        }
      }

      if (userMessage) {
        this.logger.log(`User says (Page: ${pageId}): ${userMessage}`);

        const aiConfig = shop.aiConfig;
        if (aiConfig && aiConfig.enableChatAi === false) {
          this.logger.log(
            `AI for chats is disabled for shop ${shop.id}. Skipping.`,
          );
          continue;
        }

        try {
          // 1. Check if Customer exists (to avoid Graph API rate limit)
          let customer = await this.db.customer.findUnique({
            where: {
              shopId_externalId_platform: {
                shopId: shop.id,
                externalId: messaging.sender.id,
                platform: 'FACEBOOK',
              },
            },
          });

          // 2. Fetch Profile ONLY if missing
          let profile = null;
          if (
            !customer ||
            !customer.name ||
            customer.name === 'Messenger User'
          ) {
            this.logger.log(
              `Fetching new Facebook profile for PSID: ${messaging.sender.id}`,
            );
            profile = await this.facebookService.getUserProfile(
              messaging.sender.id,
              shop.accessToken,
            );
          }

          // 3. Upsert Customer (Safe against race conditions)
          customer = await this.db.customer.upsert({
            where: {
              shopId_externalId_platform: {
                shopId: shop.id,
                externalId: messaging.sender.id,
                platform: 'FACEBOOK',
              },
            },
            update: profile
              ? {
                  name: profile.name || undefined,
                  profilePic: profile.profilePic || undefined,
                }
              : {},
            create: {
              shopId: shop.id,
              externalId: messaging.sender.id,
              platform: 'FACEBOOK',
              name: profile?.name || customer?.name || 'Messenger User',
              profilePic: profile?.profilePic || customer?.profilePic || '',
            },
          });

          // 4. Get or Create Conversation
          const conversation = await this.db.conversation.upsert({
            where: {
              shopId_psid: {
                shopId: shop.id,
                psid: messaging.sender.id,
              },
            },
            update: profile
              ? {
                  customerName: profile.name || undefined,
                  customerAvatar: profile.profilePic || undefined,
                }
              : {},
            create: {
              shopId: shop.id,
              psid: messaging.sender.id,
              customerName: customer.name || 'Facebook User',
              customerAvatar: customer.profilePic || '',
            },
          });

          // 3. Save User Message
          const savedMessage = await this.db.message.create({
            data: {
              conversationId: conversation.id,
              sender: 'USER',
              content: userMessage,
              type: 'TEXT',
            },
          });

          // NEW: Emit to UI
          this.chatGateway.emitNewMessage(shop.id, savedMessage);
          this.chatGateway.emitConversationUpdate(shop.id, {
            ...conversation,
            lastMessage: userMessage,
          });

          // 4. Fetch History (last 10 messages)
          const historyMsgs = await this.db.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'desc' },
            take: 11,
          });

          const history: { role: 'user' | 'assistant'; content: string }[] =
            historyMsgs
              .reverse()
              .slice(0, -1)
              .map((m: any) => ({
                role: m.sender === 'USER' ? 'user' : 'assistant',
                content: m.content || '',
              }));

          // 5. Get AI Response (Structured)
          const canReply = await this.usageService.canSendMessage(
            shop.id,
            shop,
          );
          if (!canReply) {
            const limitMessage =
              'Your AI message limit for the current cycle has been reached. Please upgrade your plan to continue using AI features.';
            await this.facebookService.sendMessage(
              messaging.sender.id,
              limitMessage,
              shop.accessToken,
              pageId,
            );
            continue;
          }

          const aiResponse: AiResponse = await this.aiService.processMessage(
            userMessage,
            shop,
            history,
          );

          if (
            aiResponse.thought !== 'Fallback due to error' &&
            aiResponse.thought !== 'Trial Expired'
          ) {
            await this.db.usageLog.create({
              data: {
                id: crypto.randomUUID(),
                shopId: shop.id,
                type: 'MESSAGE_AI',
              },
            });
          }

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
                order = await this.orderService.findRecentByPhone(
                  phone,
                  shop.id,
                );
              }

              if (order) {
                responseText = `📦 Status: ${order.status}\n`;
                if (order.trackingId)
                  responseText += `🚚 Tracking ID: ${order.trackingId}\n`;
                if (order.courierName)
                  responseText += `🚚 Courier: ${order.courierName}\n`;
                responseText += `\nTotal: ${order.totalPrice} BDT`;
              } else {
                responseText =
                  "Sorry, I couldn't find an order with that information. Please check the Order ID or Phone Number.";
              }

              await this.db.usageLog.create({
                data: {
                  id: crypto.randomUUID(),
                  shopId: shop.id,
                  type: 'CHECK_STATUS',
                },
              });
            } else if (intent === 'CREATE_ORDER') {
              // Extract extracted data with fallbacks
              const orderData = aiResponse.data || aiResponse.order_data;
              if (!orderData) {
                this.logger.warn(
                  `AI returned CREATE_ORDER but no data object. Downgrading to Chat.`,
                );
                responseText =
                  'Order confirm korar jonno kindly apnar **Name**, **Phone Number** ebong **Address** ta din?';

                await this.db.message.create({
                  data: {
                    conversationId: conversation.id,
                    sender: 'BOT',
                    content: responseText,
                    type: 'TEXT',
                  },
                });
                await this.facebookService.sendMessage(
                  messaging.sender.id,
                  responseText,
                  shop.accessToken,
                  pageId,
                );
                continue;
              }

              const customerName = orderData.customer_name;
              const customerPhone = orderData.phone;
              const customerAddress = orderData.address;
              // Items can be an object or string depending on AI, we standardized to object in interface but need to handle flexibility
              const rawItems = orderData.items;
              let items = [];

              if (Array.isArray(rawItems)) {
                items = rawItems;
              } else if (typeof rawItems === 'string') {
                try {
                  // Robust parsing: AI might return a JSON-stringified array
                  const parsed = JSON.parse(rawItems);
                  if (Array.isArray(parsed)) {
                    items = parsed;
                  } else {
                    items = [{ product_name: rawItems, quantity: 1 }];
                  }
                } catch (e) {
                  // Not valid JSON, treat as a single item name
                  items = [{ product_name: rawItems, quantity: 1 }];
                }
              }

              // Use confirmation message if available
              if (aiResponse.confirmation_message) {
                responseText = aiResponse.confirmation_message;
              }

              // VALIDATION: Check for missing fields
              const missingFields = [];
              // Strict check for null, "null", "Unknown" or empty string
              if (
                !customerName ||
                customerName === 'Unknown' ||
                customerName === 'null'
              )
                missingFields.push('Name');
              if (
                !customerPhone ||
                customerPhone === 'Unknown' ||
                customerPhone === 'null'
              )
                missingFields.push('Phone Number');
              if (
                !customerAddress ||
                customerAddress === 'Unknown' ||
                customerAddress === 'null'
              )
                missingFields.push('Address');
              if (!items || items.length === 0) missingFields.push('Items');

              if (missingFields.length > 0) {
                this.logger.warn(
                  `⚠️ AI tried to create incomplete order. Downgrading to Chat. Missing: ${missingFields.join(', ')}`,
                );
                responseText = `Order confirm korar jonno kindly apnar **Name**, **Phone Number** ebong **Address** ta din?`;

                // Override response text to ask for missing info, ignoring AI's confirmation message
                await this.facebookService.sendMessage(
                  messaging.sender.id,
                  responseText,
                  shop.accessToken,
                  pageId,
                );

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
                    phone: customerPhone,
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
                    equals: messaging.sender.id,
                  },
                },
              });

              if (
                recentOrder &&
                Math.abs(
                  Number(recentOrder.totalPrice) -
                    (orderData.total_price || orderData.total_amount || 0),
                ) < 1
              ) {
                this.logger.warn(
                  `Duplicate order detected from PSID ${messaging.sender.id}. Skipping creation.`,
                );
                responseText =
                  "I believe I have already placed this order! If you want to place a new one, please add 'New Order' to your message.";
              } else {
                // EXTRACTION FIX: Get delivery fee from AI persistence
                const shippingDetails = aiResponse.shipping_details;
                const deliveryFee = Number(shippingDetails?.charge) || 0;

                if (deliveryFee > 0) {
                  this.logger.log(
                    `Applying AI-persisted delivery fee: ${deliveryFee} for PSID: ${messaging.sender.id}`,
                  );
                }

                try {
                  // Create Order
                  const createdOrder = await this.orderService.create(
                    {
                      customerId: customer.id,
                      customerName: customerName,
                      customerPhone: customerPhone,
                      customerAddress: customerAddress,
                      items: items,
                      totalPrice:
                        orderData.total_price || orderData.total_amount || 0,
                      deliveryFee: deliveryFee, // Pass the extracted fee
                      status: 'PENDING',
                      psid: messaging.sender.id,
                      source: 'AI',
                      rawExtract: {
                        ...orderData,
                        shipping_details: shippingDetails,
                        deliveryChargeApplied: deliveryFee,
                        psid: messaging.sender.id,
                      },
                    },
                    shop.id,
                  );

                  await this.db.usageLog.create({
                    data: {
                      id: crypto.randomUUID(),
                      shopId: shop.id,
                      type: 'ORDER_EXTRACTED',
                    },
                  });

                  // Generate Detailed Confirmation (Final Check)
                  const rawExtract = createdOrder.rawExtract;
                  const deliveryCharge = rawExtract?.deliveryChargeApplied || 0;
                  const totalAmount = Number(createdOrder.totalPrice);

                  let itemsListString = '';
                  if (Array.isArray(items)) {
                    itemsListString = items
                      .map((i: any) => `${i.product_name} x${i.quantity}`)
                      .join('\n- ');
                  }

                  responseText =
                    `✅ *Order Confirmed!*\n\n` +
                    `🆔 Order ID: #${createdOrder.id.slice(0, 8).toUpperCase()}\n` +
                    `👤 Name: ${createdOrder.customerName}\n` +
                    `📞 Phone: ${createdOrder.customerPhone}\n` +
                    `📍 Address: ${createdOrder.customerAddress}\n\n` +
                    `📦 **Items:**\n- ${itemsListString}\n\n` +
                    `Thank you for shopping with us! Our human agent will contact you shortly to confirm your order details and delivery.`;
                } catch (orderError) {
                  this.logger.warn(
                    `Order creation failed for shop ${shop.id}: ${orderError.message}`,
                  );
                  if (
                    orderError.message.includes('limit for the current cycle')
                  ) {
                    responseText = `⚠️ ${orderError.message}`;
                  } else {
                    // Re-throw if it's a different kind of error (e.g. database down)
                    throw orderError;
                  }
                }
              }
            }
          } catch (error) {
            this.logger.warn(`Failed to process AI intent: ${error.message}`);
          }

          const savedBotMsg = await this.db.message.create({
            data: {
              conversationId: conversation.id,
              sender: 'BOT',
              content: responseText,
              type: 'TEXT',
            },
          });

          await this.db.conversation.update({
            where: { id: conversation.id },
            data: { lastMessage: responseText },
          });

          // NEW: Emit to UI
          this.chatGateway.emitNewMessage(shop.id, savedBotMsg);
          this.chatGateway.emitConversationUpdate(shop.id, {
            ...conversation,
            lastMessage: responseText,
          });

          // Branding for Basic Plan
          const removeWatermark = await this.usageService.hasFeatureAccess(
            shop.id,
            'removeWatermark',
            shop,
          );
          if (!removeWatermark) {
            responseText += '\n\n⚡ Powered by ShopSync';
          }

          await this.facebookService.sendMessage(
            messaging.sender.id,
            responseText,
            shop.accessToken,
            pageId,
          );
        } catch (error) {
          this.logger.error('Error in AI processing flow', error);
        }
      }
    }
  }
}
