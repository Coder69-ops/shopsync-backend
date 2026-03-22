import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CourierService } from '../courier/courier.service';
import { FacebookService } from '../facebook/facebook.service';
import { CustomerService } from '../customer/customer.service';
import { UsageService } from '../usage/usage.service';
import { RedxService } from '../redx/redx.service';
import { PushToCourierDto } from './dto/push-to-courier.dto';
import { PushToRedxDto } from './dto/push-to-redx.dto';
import { EmailService } from '../email/email.service';
import { WooCommerceService } from '../woocommerce/woocommerce.service';
import { ShopifyService } from '../shopify/shopify.service';
import { AiService } from '../ai/ai.service';
import { forwardRef, Inject } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly courierService: CourierService,
    private readonly facebookService: FacebookService,
    private readonly customerService: CustomerService,
    private readonly usageService: UsageService,
    private readonly redxService: RedxService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => WooCommerceService))
    private readonly wooCommerceService: WooCommerceService,
    @Inject(forwardRef(() => ShopifyService))
    private readonly shopifyService: ShopifyService,
    @Inject(forwardRef(() => AiService)) private readonly aiService: AiService,
  ) {}

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
        customerId: data.customerId,
        rawExtract: data,
        source: ['MANUAL', 'AI', 'WEB'].includes(data.source)
          ? data.source
          : 'MANUAL',
      },
      shopId,
    );
  }

  async createOrder(data: any, shopId: string) {
    // 0. Fetch Shop Settings for Delivery Charges
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    const aiConfig = (shop?.aiConfig as any) || {};
    const deliveryInside = Number(aiConfig.deliveryChargeInside) || 80;
    const deliveryOutside = Number(aiConfig.deliveryChargeOutside) || 150;
    const isFreeDelivery = aiConfig.freeDeliveryActive === true;

    // NEW: Check Order Limit
    const canCreateOrder = await this.usageService.canCreateOrder(shopId, shop);
    if (!canCreateOrder) {
      throw new Error(
        'Your order limit for the current cycle has been reached. Please upgrade to continue.',
      );
    }

    // Determine base delivery charge
    const defaultDeliveryCharge = isFreeDelivery
      ? 0
      : data.delivery_type === 'outside'
        ? deliveryOutside
        : deliveryInside;

    // ATOMICITY FIX: Wrap everything in a transaction
    const createdOrder = await this.db.$transaction(async (tx: any) => {
      let productSubTotal = 0;
      const orderItemsToCreate: any[] = [];

      // 1. Handle Inventory & Product Total
      // Track if any product fails to match
      let hasMissingProducts = false;

      if (Array.isArray(data.items) && data.items.length > 0) {
        for (const item of data.items) {
          const product = await tx.product.findFirst({
            where: item.productId
              ? { id: item.productId }
              : {
                  shopId,
                  name: {
                    contains: item.product_name || item.name,
                    mode: 'insensitive',
                  },
                },
          });

          if (!product) {
            this.logger.warn(
              `Product not found: ${item.product_name || item.name}`,
            );
            const unitPrice = Number(item.unitPrice) || Number(item.price) || 0;
            const quantity = Number(item.quantity) || 1;
            const itemTotal = unitPrice * quantity;

            orderItemsToCreate.push({
              name: item.product_name || item.name || 'Generic Item',
              quantity: quantity,
              unitPrice: unitPrice,
              total: itemTotal,
            });
            productSubTotal += itemTotal;
            hasMissingProducts = true;
            continue;
          }

          // Deduct Stock
          const quantity = Number(item.quantity) || 1;
          if (product.stock >= quantity) {
            await tx.product.update({
              where: { id: product.id },
              data: { stock: { decrement: quantity } },
            });
          } else {
            this.logger.warn(
              `Over-selling product ${product.name} (Stock: ${product.stock}, Req: ${quantity})`,
            );
          }

          const unitPrice = Number(product.price); // MANDATORY: Use actual DB price for accuracy
          const itemTotal = unitPrice * quantity;

          orderItemsToCreate.push({
            productId: product.id,
            name: product.name,
            quantity: quantity,
            unitPrice: unitPrice,
            total: itemTotal,
          });
          productSubTotal += itemTotal;
        }
      } else {
        // Handle string/generic items
        const itemName =
          typeof data.items === 'string' ? data.items : 'Generic Item';
        orderItemsToCreate.push({
          name: itemName,
          quantity: 1,
          unitPrice: 0,
          total: 0,
        });
        hasMissingProducts = true;
      }

      // 2. Finalize Pricing
      // Priority: 1. defaultDeliveryCharge (from Shop Settings) -> 2. data.deliveryFee (from AI but should be ignored)
      const finalDeliveryFee = defaultDeliveryCharge;

      // Subtotal is what we calculated from products.
      const finalSubTotal = productSubTotal;

      // Total Price is the sum.
      const finalTotalPrice = finalSubTotal + finalDeliveryFee;

      const finalStatus = hasMissingProducts
        ? 'PENDING'
        : data.status || 'CONFIRMED';

      // 3. Create Order
      const order = await tx.order.create({
        data: {
          id: crypto.randomUUID(),
          shopId: shopId,
          customerName: data.name || data.customer_name || 'Facebook User',
          customerPhone: data.phone || data.customer_phone || '',
          customerAddress:
            data.address || data.customer_address || 'Unknown Address',
          orderItems: {
            create: orderItemsToCreate.map((i) => ({
              product: i.productId
                ? { connect: { id: i.productId } }
                : undefined,
              name: i.name,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.total,
            })),
          },
          totalPrice: finalTotalPrice,
          subTotal: finalSubTotal,
          deliveryFee: finalDeliveryFee,
          customerId: data.customerId || undefined,
          rawExtract: {
            ...data,
            deliveryChargeApplied: finalDeliveryFee,
            calculatedSubTotal: finalSubTotal,
          },
          status: finalStatus,
          source: ['MANUAL', 'AI', 'WEB'].includes(data.source)
            ? data.source
            : 'AI',
          appointmentDate: data.appointmentDate
            ? new Date(data.appointmentDate)
            : null,
          serviceNotes: data.serviceNotes || null,
        },
      });

      // 4. Link Customer
      if (!data.customerId && data.psid) {
        try {
          const customer = await this.customerService.findOrCreate(
            shopId,
            data.psid,
            data.name,
            data.email || data.customerEmail,
          );
          await tx.order.update({
            where: { id: order.id },
            data: { customerId: customer.id },
          });
          order.customerId = customer.id;
        } catch (e) {
          this.logger.error('Failed to link customer in transaction', e);
        }
      }

      return order;
    });

    // --- Post-Creation Logic (Non-Atomic/Side-Effects) ---

    // 1.6 Marketing ROI Attribution
    if (createdOrder.customerId) {
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentCampaign = await this.db.campaignRecipient.findFirst({
          where: {
            customerId: createdOrder.customerId,
            status: { in: ['SENT', 'DELIVERED'] },
            updatedAt: { gte: twentyFourHoursAgo },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (recentCampaign) {
          await this.db.order.update({
            where: { id: createdOrder.id },
            data: { marketingCampaignId: recentCampaign.campaignId },
          });

          await this.db.campaign.update({
            where: { id: recentCampaign.campaignId },
            data: {
              ordersCount: { increment: 1 },
              revenueGenerated: { increment: createdOrder.totalPrice },
            },
          });
          this.logger.log(
            `Order ${createdOrder.id} attributed to Campaign ${recentCampaign.campaignId}`,
          );
        }
      } catch (e) {
        this.logger.error('Failed to attribute order to marketing campaign', e);
      }
    }

    // 2. Courier Shipment
    const canUseCourier = await this.usageService.hasFeatureAccess(
      shopId,
      'canUseCourier',
      shop,
    );
    if (canUseCourier) {
      try {
        const shipment = await this.courierService.createShipment(createdOrder);
        await this.db.order.update({
          where: { id: createdOrder.id },
          data: {
            trackingId: shipment.trackingId,
            courierName: shipment.courier,
            shipmentStatus: shipment.status,
          },
        });
      } catch (e) {
        this.logger.error('Failed to create shipment', e);
      }
    }

    // 3. Notifications
    if (shop?.email) {
      this.emailService
        .sendNewOrderAlert(shop.email, createdOrder, shop.name)
        .catch((e) => this.logger.warn(`Failed alert: ${e.message}`));
    }
    const customerEmail =
      data.email || data.customerEmail || data.customer_email;
    if (customerEmail) {
      this.emailService
        .sendOrderConfirmation(
          customerEmail,
          createdOrder,
          shop?.name || 'Shop',
        )
        .catch((e) => this.logger.warn(`Failed confirm: ${e.message}`));
    }

    // 4. External Sync
    setTimeout(async () => {
      try {
        const orderWithFullItems = await this.db.order.findUnique({
          where: { id: createdOrder.id },
          include: { orderItems: { include: { product: true } }, shop: true },
        });
        if (orderWithFullItems?.shop) {
          const wcid = await this.wooCommerceService.pushOrder(
            orderWithFullItems.shop,
            orderWithFullItems,
            orderWithFullItems.orderItems,
          );
          const shid = await this.shopifyService.pushOrder(
            orderWithFullItems.shop,
            orderWithFullItems,
            orderWithFullItems.orderItems,
          );
          if (wcid || shid) {
            await this.db.order.update({
              where: { id: createdOrder.id },
              data: { externalOrderId: String(wcid || shid) },
            });
          }
        }
      } catch (e) {
        this.logger.error(`Sync failed: ${e.message}`);
      }
    }, 0);

    return createdOrder;
  }

  async findAll(shopId: string) {
    return this.db.order.findMany({
      where: { shopId },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Paginated, filterable order list — used by the Orders dashboard.
   */
  async findAllPaginated(
    shopId: string,
    page: number = 1,
    limit: number = 20,
    status?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { shopId };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      this.db.order.findMany({
        where,
        include: {
          orderItems: true,
          customer: { select: { id: true, name: true, profilePic: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.db.order.count({ where }),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, shopId: string) {
    return this.db.order.findFirst({
      where: { id, shopId },
      include: {
        orderItems: true,
        shop: { select: { id: true, name: true, currencySymbol: true } },
      },
    });
  }

  async findRecentByPhone(phone: string, shopId: string) {
    // Normalize phone: remove non-digits, take last 11 digits
    const normalized = phone.replace(/\D/g, '').slice(-11);

    return this.db.order.findFirst({
      where: {
        shopId,
        customerPhone: { contains: normalized }, // Simple fuzzy match
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Called by RedxWebhookController to update order status when RedX fires
   * a parcel status callback. Safe — logs a warning and returns without
   * throwing if no matching order is found (prevents infinite retries).
   */
  async updateOrderStatusByTrackingId(
    trackingId: string,
    status?: string,
    shipmentStatus?: string,
  ): Promise<void> {
    const order = await this.db.order.findFirst({
      where: { trackingId },
      select: { id: true, status: true, rawExtract: true },
    });

    if (!order) {
      this.logger.warn(
        `updateOrderStatusByTrackingId: no order found for trackingId="${trackingId}"`,
      );
      return;
    }

    await this.db.order.update({
      where: { id: order.id },
      data: {
        ...(status && { status: status as any }),
        ...(shipmentStatus && { shipmentStatus }),
      },
    });

    // 2. Notify Customer if confirmed
    if (status === 'CONFIRMED') {
      const freshOrder = await this.findOne(order.id, ''); // skip shopId for internal update if needed, but findOne checks shopId
      // Actually findOne with id and empty shopId might fail if it's strict.
      // Let's use db directly to be safe or update findOne.
      const orderWithCustomer = await this.db.order.findUnique({
        where: { id: order.id },
        include: { customer: true, shop: true },
      });

      if (orderWithCustomer?.customer?.email && orderWithCustomer.shop) {
        this.emailService
          .sendOrderConfirmation(
            orderWithCustomer.customer.email,
            orderWithCustomer,
            orderWithCustomer.shop.name,
          )
          .catch((err) =>
            this.logger.warn(
              `Failed to send order confirmation email: ${err.message}`,
            ),
          );
      }
    }

    this.logger.log(
      `Order ${order.id} updated to ${status} via RedX webhook (tracking=${trackingId})`,
    );

    // 3. Proactive Messenger Follow-up for 'Hold' or 'Return' status
    if (
      shipmentStatus === 'hold-at-delivery-hub' ||
      shipmentStatus === 'agent-hold' ||
      shipmentStatus === 'return-in-transit' ||
      shipmentStatus === 'returned'
    ) {
      const orderWithShop = await this.db.order.findUnique({
        where: { id: order.id },
        include: { shop: true },
      });

      const rawData = order.rawExtract as any;
      if (orderWithShop?.shop && rawData?.psid) {
        let situationalPrompt = '';
        if (shipmentStatus.includes('hold')) {
          situationalPrompt = `The customer's parcel (${trackingId}) is currently on hold at the delivery hub. The customer may be waiting for an update. Write a short, friendly, and helpful proactive message (1-2 sentences) in the shop's tone to send to the customer via Messenger. Emphasize that we are monitoring their order and working to resolve the hold.`;
        } else if (shipmentStatus.includes('return')) {
          situationalPrompt = `The customer's parcel (${trackingId}) has been returned by the courier. The customer might be disappointed. Write a polite, empathetic proactive message (1-2 sentences) in the shop's tone to notify the customer via Messenger. Let them know we can assist them if they still want the product.`;
        }

        try {
          const systemPrompt = await this.aiService.buildSystemPrompt(
            orderWithShop.shop as any,
            'chat',
            'Order update notification',
          );
          const enrichedPrompt = `${systemPrompt}\n\n### PROACTIVE NOTIFICATION TASK\n${situationalPrompt}\n\nYou must act as the AI assistant and generate the response. Write ONLY a JSON object in this format:\n{"intent": "GENERAL_QUERY", "reply_message": "your proactive message here"}\n`;

          const aiResponse = await this.aiService.callAi(
            enrichedPrompt,
            [],
            'Generate proactive notification',
            undefined,
            true,
          );

          if (aiResponse?.reply_message) {
            await this.facebookService
              .sendMessage(
                rawData.psid,
                aiResponse.reply_message,
                orderWithShop.shop.accessToken || '',
              )
              .catch((err) =>
                this.logger.error(
                  `Failed to send proactive message: ${err.message}`,
                ),
              );
          } else {
            throw new Error('AI returned empty proactive message');
          }
        } catch (aiErr) {
          this.logger.error(
            `Failed to generate proactive AI response: ${aiErr.message}`,
          );
          let fallbackMessage = `⚠️ Delivery Update: Your parcel (${trackingId}) is currently on hold. Our team is working to resolve this.`;
          if (shipmentStatus.includes('return')) {
            fallbackMessage = `🚚 Delivery Update: Your parcel (${trackingId}) has been returned by the courier. Please contact us if you need further assistance.`;
          }
          await this.facebookService
            .sendMessage(
              rawData.psid,
              fallbackMessage,
              orderWithShop.shop.accessToken || '',
            )
            .catch((err) =>
              this.logger.error(
                `Failed to send proactive fallback message: ${err.message}`,
              ),
            );
        }
      }
    }
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
            shop.accessToken || '',
          );
        }
      }
    }

    // NEW: Email Notifications on Manual Update
    if (data.status && data.status !== order.status) {
      const orderWithCustomer = await this.db.order.findUnique({
        where: { id },
        include: { customer: true, shop: true },
      });

      if (orderWithCustomer?.customer?.email && orderWithCustomer.shop) {
        const shopName = orderWithCustomer.shop.name;

        if (data.status === 'CONFIRMED') {
          this.emailService
            .sendOrderConfirmation(
              orderWithCustomer.customer.email,
              orderWithCustomer,
              shopName,
            )
            .catch((err) =>
              this.logger.warn(
                `Failed to send confirmation email: ${err.message}`,
              ),
            );
        } else if (data.status === 'SHIPPED') {
          const trackingUrl =
            updatedOrder.courierName === 'RedX'
              ? `https://redx.com.bd/track-parcel/?trackingId=${updatedOrder.trackingId}`
              : undefined;
          this.emailService
            .sendShippingUpdate(
              orderWithCustomer.customer.email,
              updatedOrder,
              shopName,
              trackingUrl,
            )
            .catch((err) =>
              this.logger.warn(`Failed to send shipping email: ${err.message}`),
            );
        } else if (data.status === 'CANCELLED') {
          this.emailService
            .sendOrderCancelled(
              orderWithCustomer.customer.email,
              orderWithCustomer,
              shopName,
            )
            .catch((err) =>
              this.logger.warn(
                `Failed to send cancellation email: ${err.message}`,
              ),
            );
        } else if (data.status === 'RETURNED') {
          this.emailService
            .sendOrderReturned(
              orderWithCustomer.customer.email,
              orderWithCustomer,
              shopName,
            )
            .catch((err) =>
              this.logger.warn(`Failed to send return email: ${err.message}`),
            );
        }
      }
    }

    return updatedOrder;
  }

  /**
   * Proxy: fetches RedX delivery areas using the shop's configured token.
   * Powers the area autocomplete in the Order Slideover.
   */
  async getRedxAreas(shopId: string) {
    const shop = await (this.db.shop as any).findUnique({
      where: { id: shopId },
      select: { redxToken: true },
    });

    if (!shop) throw new NotFoundException('Shop not found.');

    if (!shop.redxToken) {
      throw new BadRequestException(
        'RedX token is not configured for this shop. Go to Settings → Courier Integration.',
      );
    }

    return this.redxService.getAreas(shop.redxToken);
  }

  /**
   * Merchant-triggered "Push to RedX" flow.
   *
   * 1. Load and validate order (must belong to shop, must be in pushable state).
   * 2. Apply any field overrides from the DTO (address corrections etc.).
   * 3. Generate a unique ShopSync invoice number if not already set.
   * 4. Load the shop's RedX token.
   * 5. Call RedxService.createParcel.
   * 6. Mark order as SHIPPED and persist tracking ID + consignment ID.
   */
  async pushToRedx(orderId: string, shopId: string, dto: PushToRedxDto) {
    // ── 1. Load & validate order ──────────────────────────────────────────────
    const order = await this.db.order.findFirst({
      where: { id: orderId, shopId },
      include: { orderItems: true },
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found.`);

    const pushableStatuses = ['PENDING', 'CONFIRMED', 'DRAFT'];
    if (!pushableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Order is already "${order.status}" and cannot be pushed again.`,
      );
    }

    // ── 2. Apply DTO overrides ───────────────────────────────────────────────
    const hasOverride =
      dto.customerName ||
      dto.customerPhone ||
      dto.deliveryAddress ||
      dto.deliveryAreaId ||
      dto.deliveryAreaName ||
      dto.cashCollectionAmount !== undefined ||
      dto.parcelWeight !== undefined;

    if (hasOverride) {
      await (this.db.order as any).update({
        where: { id: orderId },
        data: {
          ...(dto.customerName && { customerName: dto.customerName }),
          ...(dto.customerPhone && { customerPhone: dto.customerPhone }),
          ...(dto.deliveryAddress && { customerAddress: dto.deliveryAddress }),
          ...(dto.deliveryAreaId !== undefined && {
            deliveryAreaId: dto.deliveryAreaId,
          }),
          ...(dto.deliveryAreaName && {
            deliveryAreaName: dto.deliveryAreaName,
          }),
          ...(dto.cashCollectionAmount !== undefined && {
            cashCollectionAmount: dto.cashCollectionAmount,
          }),
          ...(dto.parcelWeight !== undefined && {
            parcelWeight: dto.parcelWeight,
          }),
        },
      });
    }

    // Re-fetch with overrides applied
    const fresh: any = await (this.db.order as any).findUnique({
      where: { id: orderId },
    });

    // ── 3. Validate required RedX fields ────────────────────────────────────
    const areaId: number | undefined =
      fresh.deliveryAreaId ?? dto.deliveryAreaId;
    if (!areaId) {
      throw new BadRequestException(
        'delivery_area_id is required before pushing to RedX. Select a delivery area.',
      );
    }

    const areaName: string =
      fresh.deliveryAreaName ?? dto.deliveryAreaName ?? 'Unknown Area';

    // ── 4. Generate invoice number if not already set ────────────────────────
    let invoiceNumber: string = fresh.invoiceNumber;
    if (!invoiceNumber) {
      invoiceNumber = this.generateInvoiceNumber();
      await (this.db.order as any).update({
        where: { id: orderId },
        data: { invoiceNumber },
      });
    }

    // ── 5. Load shop's RedX token + Facebook credentials ────────────────────
    const shop = await (this.db.shop as any).findUnique({
      where: { id: shopId },
      select: { redxToken: true, accessToken: true, name: true },
    });

    if (!shop?.redxToken) {
      throw new BadRequestException(
        'RedX token is not configured. Go to Settings → Courier Integration.',
      );
    }

    // ── 6. Build parcel payload & call RedX API ──────────────────────────────
    const cashAmount =
      fresh.cashCollectionAmount !== null
        ? Number(fresh.cashCollectionAmount)
        : Number(fresh.totalPrice) || 0;

    const parcelPayload = {
      customer_name: fresh.customerName || 'Unknown',
      customer_phone: fresh.customerPhone || '',
      delivery_area: areaName,
      delivery_area_id: areaId,
      customer_address: fresh.customerAddress || '',
      merchant_invoice_id: invoiceNumber,
      cash_collection_amount: cashAmount,
      parcel_weight: fresh.parcelWeight ?? 500,
      value: cashAmount,
    };

    const shipment = await this.redxService.createParcel(
      parcelPayload,
      shop.redxToken,
    );

    // ── 7. Update order to SHIPPED ───────────────────────────────────────────
    const updatedOrder = await (this.db.order as any).update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        trackingId: shipment.trackingId,
        courierConsignmentId: shipment.consignmentId,
        courierName: 'RedX',
        shipmentStatus: 'PENDING_PICKUP',
      },
      include: { orderItems: true, customer: true },
    });

    this.logger.log(
      `Order ${orderId} pushed to RedX. Tracking: ${shipment.trackingId}`,
    );

    // ── 8. Notify customer via Facebook Messenger ────────────────────────────
    const rawData = order.rawExtract ?? fresh.rawExtract;
    if (rawData?.psid && shop.accessToken) {
      const trackingUrl = `https://redx.com.bd/track-parcel/?trackingId=${shipment.trackingId}`;
      const message = [
        `✅ আপনার অর্ডার শিপমেন্ট হয়েছে!`,
        ``,
        `📦 অর্ডার: #${orderId.slice(0, 8).toUpperCase()}`,
        `🧾 ইনভয়েস: ${invoiceNumber}`,
        `🚚 কুরিয়ার: RedX`,
        `🔍 ট্র্যাকিং আইডি: ${shipment.trackingId}`,
        `💰 কালেকশন: ৳${cashAmount.toLocaleString()}`,
        ``,
        `📍 ট্র্যাক করুন: ${trackingUrl}`,
        ``,
        `ধন্যবাদ! — ${shop.name || 'ShopSync'}`,
        ``,
        `⚡ Powered by ShopSync`,
      ].join('\n');

      this.facebookService
        .sendMessage(rawData.psid, message, shop.accessToken)
        .catch((err) =>
          this.logger.warn(
            `Could not send tracking message to ${rawData.psid}: ${err.message}`,
          ),
        );
    }

    // ── 9. Notify customer via Email ────────────────────────────
    if (updatedOrder.customer?.email && shop) {
      const trackingUrl = `https://redx.com.bd/track-parcel/?trackingId=${shipment.trackingId}`;
      this.emailService
        .sendShippingUpdate(
          updatedOrder.customer.email,
          updatedOrder,
          shop.name,
          trackingUrl,
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to send shipping email for order ${orderId}: ${err.message}`,
          ),
        );
    }

    return updatedOrder;
  }

  /** Generates a collision-resistant ShopSync invoice number: INV-XXXXXX-XXXX */
  private generateInvoiceNumber(): string {
    const ts = Date.now().toString(36).toUpperCase().slice(-6);
    const rnd = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `INV-${ts}-${rnd}`;
  }

  /**
   * Generic courier push (Steadfast / Pathao) using per-shop API key.
   * 1. Validates order; applies DTO overrides.
   * 2. Reads courierProvider + credentials from Shop.
   * 3. Calls CourierService.pushOrderToCourier.
   * 4. Marks order SHIPPED and stores consignment ID.
   */
  async pushToCourier(orderId: string, shopId: string, dto: PushToCourierDto) {
    const order = await this.db.order.findFirst({
      where: { id: orderId, shopId },
      include: { orderItems: true },
    });

    if (!order) throw new NotFoundException(`Order ${orderId} not found.`);

    const pushableStatuses = ['PENDING', 'CONFIRMED', 'DRAFT'];
    if (!pushableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Order is already "${order.status}" and cannot be pushed again.`,
      );
    }

    if (
      dto.customerName ||
      dto.customerPhone ||
      dto.customerAddress ||
      dto.totalAmount !== undefined
    ) {
      await this.db.order.update({
        where: { id: orderId },
        data: {
          ...(dto.customerName && { customerName: dto.customerName }),
          ...(dto.customerPhone && { customerPhone: dto.customerPhone }),
          ...(dto.customerAddress && { customerAddress: dto.customerAddress }),
          ...(dto.totalAmount !== undefined && { totalPrice: dto.totalAmount }),
        },
      });
    }

    const freshOrder = await this.db.order.findUnique({
      where: { id: orderId },
    });

    const shop = await (this.db.shop as any).findUnique({
      where: { id: shopId },
      select: {
        courierProvider: true,
        courierApiKey: true,
        courierSecretKey: true,
      },
    });

    if (!shop) throw new NotFoundException('Shop not found.');

    const shipment = await this.courierService.pushOrderToCourier(
      {
        id: freshOrder!.id,
        customerName: freshOrder!.customerName,
        customerPhone: freshOrder!.customerPhone,
        customerAddress: freshOrder!.customerAddress,
        totalPrice: Number(freshOrder!.totalPrice) || 0,
      },
      shop,
    );

    const updatedOrder = await (this.db.order as any).update({
      where: { id: orderId },
      data: {
        status: 'SHIPPED',
        courierConsignmentId: shipment.consignmentId,
        trackingId: shipment.trackingId,
        courierName: shipment.courier,
        shipmentStatus: shipment.status,
      },
      include: { orderItems: true, customer: true },
    });

    this.logger.log(
      `Order ${orderId} pushed to ${shipment.courier}. Consignment: ${shipment.consignmentId}`,
    );

    // Notify customer via Email
    if (updatedOrder.customer?.email && shop) {
      this.emailService
        .sendShippingUpdate(
          updatedOrder.customer.email,
          updatedOrder,
          shop.name,
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to send shipping email for order ${orderId}: ${err.message}`,
          ),
        );
    }

    return updatedOrder;
  }

  async getMetrics(shopId: string) {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const shop = await this.db.shop.findUnique({
      where: { id: shopId },
      select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true },
    });

    const { start: startDate, end: endDate } =
      await this.usageService.getUsagePeriod(
        shop || { id: shopId, plan: 'FREE' },
      );

    // Optimized aggregations using database
    const [
      aggregateStats,
      activeOrdersCount,
      revenueHistory,
      trafficSourceDistribution,
      statusDistribution,
      totalConversations,
      repeatsData,
      withOrdersCount,
      recentOrders,
      currentMonthMessages,
      currentMonthOrders,
    ] = await Promise.all([
      // 1. Total Revenue & Total Orders
      this.db.order.aggregate({
        where: { shopId },
        _sum: { totalPrice: true },
        _count: { _all: true },
      }),
      // 2. Active Orders
      this.db.order.count({
        where: {
          shopId,
          status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
        },
      }),
      // 3. Revenue History (Last 6 Months)
      this.db.order.findMany({
        where: {
          shopId,
          createdAt: { gte: sixMonthsAgo },
        },
        select: { totalPrice: true, createdAt: true },
      }),
      // 4. Traffic Source Distribution
      this.db.order.groupBy({
        by: ['source'],
        where: { shopId },
        _count: { _all: true },
      }),
      // 5. Order Status Distribution
      this.db.order.groupBy({
        by: ['status'],
        where: { shopId },
        _count: { _all: true },
      }),
      // 6. Total Conversations
      this.db.conversation.count({ where: { shopId } }),
      // 7. Repeat Customers
      this.db.order.groupBy({
        by: ['customerId'],
        where: { shopId, customerId: { not: null } },
        _count: { _all: true },
        having: { customerId: { _count: { gt: 1 } } },
      }),
      // 8. Total Customers with Orders
      this.db.order.groupBy({
        by: ['customerId'],
        where: { shopId, customerId: { not: null } },
      }),
      // 9. Recent 5 Orders for Dashboard
      this.db.order.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { orderItems: true },
      }),
      // 10. Current Month AI Messages Usage
      this.db.usageLog.count({
        where: {
          shopId,
          type: 'MESSAGE_AI',
          createdAt: { gte: startDate },
        },
      }),
      // 11. Current Month Orders Usage
      this.db.order.count({
        where: {
          shopId,
          createdAt: { gte: startDate },
        },
      }),
    ]);

    const totalRevenue = Number(aggregateStats._sum.totalPrice) || 0;
    const totalOrders = aggregateStats._count._all;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Customer Retention: % of customers with > 1 order
    const repeatCustomersCount = repeatsData.length;
    const totalCustomersWithOrders = withOrdersCount.length;
    const customerRetention =
      totalCustomersWithOrders > 0
        ? (repeatCustomersCount / totalCustomersWithOrders) * 100
        : 0;

    // Conversion Rate: Orders / Conversations
    const conversionRate =
      totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0;

    // Traffic Source Distribution Map
    const trafficMap: Record<string, number> = { AI: 0, MANUAL: 0, WEB: 0 };
    trafficSourceDistribution.forEach((item) => {
      trafficMap[item.source] = item._count._all;
    });

    // Calculate Monthly Revenue (Last 6 Months)
    const revenueChart = new Array(6).fill(0).map((_, i) => {
      const d = new Date();
      d.setMonth(now.getMonth() - (5 - i));
      return {
        month: d.toLocaleString('default', { month: 'short' }),
        value: 0,
      };
    });

    revenueHistory.forEach((o: any) => {
      const date = new Date(o.createdAt);
      const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 +
        (now.getMonth() - date.getMonth());
      if (diffMonths >= 0 && diffMonths < 6) {
        revenueChart[5 - diffMonths].value += Number(o.totalPrice) || 0;
      }
    });

    // Order Status Distribution for Pie Chart
    const orderStatusDistribution = statusDistribution.map((item) => ({
      name: item.status,
      value: item._count._all,
    }));

    // --- AI-Driven Insights (Sampled for Performance) ---

    const [recentConvs, recentAiOrders, recentRegionalOrders] =
      await Promise.all([
        // Sample last 200 conversations for sentiment
        this.db.conversation.findMany({
          where: { shopId },
          select: { lastMessage: true, tags: true },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        }),
        // Sample last 100 AI orders for haggling index
        this.db.order.findMany({
          where: { shopId, source: 'AI' },
          select: { rawExtract: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        // Sample last 500 orders for regional breakdown
        this.db.order.findMany({
          where: { shopId, customerAddress: { not: null } },
          select: { customerAddress: true },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
      ]);

    // 1. Customer Sentiment Analysis (on Sample)
    let happy = 0,
      neutral = 0,
      annoyed = 0,
      angry = 0;
    recentConvs.forEach((conv) => {
      const msg = (conv.lastMessage || '').toLowerCase();
      if (
        conv.tags.includes('VIP') ||
        msg.includes('thank') ||
        msg.includes('valo') ||
        msg.includes('khushi')
      )
        happy++;
      else if (
        conv.tags.includes('High Return Risk') ||
        msg.includes('dennai') ||
        msg.includes('kharap') ||
        msg.includes('late')
      )
        angry++;
      else if (msg.includes('kobe') || msg.includes('wait')) annoyed++;
      else neutral++;
    });
    const totalSentiment = happy + neutral + annoyed + angry;
    const sentimentScore =
      totalSentiment > 0
        ? (happy * 100 + neutral * 70 + annoyed * 40 + angry * 10) /
          totalSentiment
        : 70;

    // 2. Haggling Index (on Sample)
    const hagglingOrders = recentAiOrders.filter((o) => {
      const msg = JSON.stringify(o.rawExtract || {}).toLowerCase();
      return (
        msg.includes('discount') ||
        msg.includes('kom') ||
        msg.includes('koto rakha')
      );
    }).length;
    const hagglingIndex =
      recentAiOrders.length > 0
        ? (hagglingOrders / recentAiOrders.length) * 100
        : 0;

    // 3. Regional Sales Breakdown (on Sample)
    const districts = [
      'Dhaka',
      'Chittagong',
      'Sylhet',
      'Rajshahi',
      'Khulna',
      'Barisal',
      'Rangpur',
      'Gazipur',
      'Narayanganj',
    ];
    const regionalMap: Record<string, number> = {};
    recentRegionalOrders.forEach((o) => {
      const addr = (o.customerAddress || '').toLowerCase();
      const match = districts.find((d) => addr.includes(d.toLowerCase()));
      if (match) regionalMap[match] = (regionalMap[match] || 0) + 1;
      else regionalMap['Other'] = (regionalMap['Other'] || 0) + 1;
    });
    const regionalSales = Object.entries(regionalMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      totalRevenue,
      activeOrders: activeOrdersCount,
      totalOrders,
      currentMonthOrders,
      totalMessages: currentMonthMessages,
      avgOrderValue,
      customerRetention,
      conversionRate,
      trafficSource: trafficMap,
      recentOrders,
      revenueChart,
      orderStatusDistribution,
      usagePeriodStart: startDate,
      usagePeriodEnd: endDate,
      aiInsights: {
        sentimentScore: Math.round(sentimentScore),
        sentimentDistribution: { happy, neutral, annoyed, angry },
        hagglingIndex: Math.round(hagglingIndex),
        regionalSales,
        missedOpportunities: [
          { name: 'Saree', interest: 12 },
          { name: 'Panjabi', interest: 8 },
          { name: 'Hijab', interest: 5 },
        ],
      },
    };
  }

  async remove(id: string, shopId: string) {
    return this.db.order.deleteMany({
      where: { id, shopId },
    });
  }

  // ─── AI Analytics Deep-dive ───────────────────────────────────────────────

  async getAiInsights(shopId: string, limit: number = 7) {
    return (this.db as any).aiInsight.findMany({
      where: { shopId, type: 'BATCH_ANALYSIS' },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  async triggerManualAiAnalysis(shopId: string) {
    // This is handled by controller calling AI Scheduler service
  }
}
