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
    // 0. Fetch Shop Settings for Delivery Charges
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    const aiConfig = (shop?.aiConfig as any) || {};
    const deliveryInside = Number(aiConfig.deliveryChargeInside) || 80;
    const deliveryOutside = Number(aiConfig.deliveryChargeOutside) || 150;

    // NEW: Check Order Limit
    const canCreateOrder = await this.usageService.canCreateOrder(shopId);
    if (!canCreateOrder) {
      throw new Error(
        'Your monthly order limit has been reached. Please upgrade to continue.',
      );
    }

    const deliveryCharge =
      data.delivery_type === 'outside' ? deliveryOutside : deliveryInside;
    let totalPrice = Number(data.totalPrice) || Number(data.total_price) || 0;
    let itemsString = data.items;

    // 1. Handle Inventory Extraction if items is an array
    if (Array.isArray(data.items) && data.items.length > 0) {
      const formattedItems: any[] = [];
      let productTotal = 0;

      // Use transaction to ensure stock consistency
      await this.db.$transaction(async (tx: any) => {
        for (const item of data.items) {
          const productSelector = item.productId
            ? { id: item.productId }
            : {
              shopId_sku: { shopId, sku: item.sku },
            };

          // If no product ID or SKU, try matching by name (fuzzy)
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
              `Product not found during extraction: ${item.product_name}`,
            );
            continue;
          }

          if (product.stock < item.quantity) {
            this.logger.warn(`Insufficient stock for ${product.name}`);
          }

          // Deduct Stock if possible
          if (product.stock >= item.quantity) {
            await tx.product.update({
              where: { id: product.id },
              data: { stock: product.stock - item.quantity },
            });
          }

          formattedItems.push({
            productId: product.id,
            name: product.name,
            quantity: item.quantity,
            unitPrice: product.price,
            total: Number(product.price) * item.quantity,
          });
          productTotal += Number(product.price) * item.quantity;
        }
      });

      if (formattedItems.length > 0) {
        itemsString = JSON.stringify(formattedItems); // Will be mapped later
        // Correct Total Price: Products + Delivery
        totalPrice = productTotal + deliveryCharge;
      }
    }

    // Build OrderItems array
    let orderItemsData: any[] = [];
    try {
      const parsed =
        typeof itemsString === 'string' ? JSON.parse(itemsString) : itemsString;
      if (Array.isArray(parsed)) {
        orderItemsData = parsed.map((i) => ({
          productId: i.productId || null,
          name: i.name || i.product_name || 'Generic Item',
          quantity: i.quantity || 1,
          unitPrice: i.unitPrice || 0,
          total: i.total || 0,
        }));
      }
    } catch (e) {
      orderItemsData = [
        {
          name: itemsString || 'Generic Item',
          quantity: 1,
          unitPrice: 0,
          total: 0,
        },
      ];
    }

    // 2. Create Order in DB
    const order = await this.db.order.create({
      data: {
        id: crypto.randomUUID(),
        shopId: shopId,
        customerName: data.name || data.customer_name,
        customerPhone: data.phone || data.customer_phone,
        customerAddress: data.address || data.customer_address,
        orderItems: {
          create: orderItemsData,
        },
        totalPrice: totalPrice,
        rawExtract: { ...data, deliveryChargeApplied: deliveryCharge },
        status: 'CONFIRMED',
        source: data.source || 'AI',
        appointmentDate:
          data.appointmentDate || data.appointment_date
            ? new Date(data.appointmentDate || data.appointment_date)
            : null,
        serviceNotes: data.serviceNotes || data.service_notes || null,
      },
    });

    // 1.5 Link to Customer (CRM)
    if (data.psid) {
      try {
        const customer = await this.customerService.findOrCreate(
          shopId,
          data.psid,
          data.name,
          data.email || data.customerEmail || data.customer_email,
        );
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

    // 2. Check Plan Permission for Courier (Pro Only)
    // Re-fetching shop here to be safe, or we could pass it down.
    // For efficiency, we already fetched shop at start of this method (line 39).
    const canUseCourier = await this.usageService.hasFeatureAccess(
      shopId,
      'canUseCourier',
    );

    if (canUseCourier) {
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
    } else {
      this.logger.log(`Order ${order.id}: Auto-booking skipped (Starter Plan)`);
    }

    // 4. Notify Merchant of New Order
    if (shop?.email) {
      this.emailService.sendNewOrderAlert(shop.email, order, shop.name).catch((err) =>
        this.logger.warn(`Failed to send merchant order alert: ${err.message}`),
      );
    }

    // 5. Notify Customer of Order Confirmation
    const customerEmail = data.email || data.customerEmail || data.customer_email;
    if (customerEmail && order) {
      this.emailService.sendOrderConfirmation(customerEmail, order, shop?.name || 'Shop').catch((err) =>
        this.logger.warn(`Failed to send customer order confirmation: ${err.message}`),
      );
    }

    return order;
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
        include: { orderItems: true, customer: { select: { id: true, name: true, profilePic: true } } },
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
    status: string,
  ): Promise<void> {
    const order = await this.db.order.findFirst({
      where: { trackingId },
      select: { id: true, status: true },
    });

    if (!order) {
      this.logger.warn(
        `updateOrderStatusByTrackingId: no order found for trackingId="${trackingId}"`,
      );
      return;
    }

    await this.db.order.update({
      where: { id: order.id },
      data: { status: status as any },
    });

    // 2. Notify Customer if confirmed
    if (status === 'CONFIRMED') {
      const freshOrder = await this.findOne(order.id, ''); // skip shopId for internal update if needed, but findOne checks shopId
      // Actually findOne with id and empty shopId might fail if it's strict. 
      // Let's use db directly to be safe or update findOne.
      const orderWithCustomer = await this.db.order.findUnique({
        where: { id: order.id },
        include: { customer: true, shop: true }
      });

      if (orderWithCustomer?.customer?.email && orderWithCustomer.shop) {
        this.emailService.sendOrderConfirmation(orderWithCustomer.customer.email, orderWithCustomer, orderWithCustomer.shop.name).catch((err) =>
          this.logger.warn(`Failed to send order confirmation email: ${err.message}`),
        );
      }
    }

    this.logger.log(
      `Order ${order.id} updated to ${status} via RedX webhook (tracking=${trackingId})`,
    );
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
        include: { customer: true, shop: true }
      });

      if (orderWithCustomer?.customer?.email && orderWithCustomer.shop) {
        const shopName = orderWithCustomer.shop.name;

        if (data.status === 'CONFIRMED') {
          this.emailService.sendOrderConfirmation(orderWithCustomer.customer.email, orderWithCustomer, shopName).catch(err =>
            this.logger.warn(`Failed to send confirmation email: ${err.message}`)
          );
        } else if (data.status === 'SHIPPED') {
          const trackingUrl = updatedOrder.courierName === 'RedX'
            ? `https://redx.com.bd/track-parcel/?trackingId=${updatedOrder.trackingId}`
            : undefined;
          this.emailService.sendShippingUpdate(orderWithCustomer.customer.email, updatedOrder, shopName, trackingUrl).catch(err =>
            this.logger.warn(`Failed to send shipping email: ${err.message}`)
          );
        } else if (data.status === 'CANCELLED') {
          this.emailService.sendOrderCancelled(orderWithCustomer.customer.email, orderWithCustomer, shopName).catch(err =>
            this.logger.warn(`Failed to send cancellation email: ${err.message}`)
          );
        } else if (data.status === 'RETURNED') {
          this.emailService.sendOrderReturned(orderWithCustomer.customer.email, orderWithCustomer, shopName).catch(err =>
            this.logger.warn(`Failed to send return email: ${err.message}`)
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
          ...(dto.deliveryAreaId !== undefined && { deliveryAreaId: dto.deliveryAreaId }),
          ...(dto.deliveryAreaName && { deliveryAreaName: dto.deliveryAreaName }),
          ...(dto.cashCollectionAmount !== undefined && {
            cashCollectionAmount: dto.cashCollectionAmount,
          }),
          ...(dto.parcelWeight !== undefined && { parcelWeight: dto.parcelWeight }),
        },
      });
    }

    // Re-fetch with overrides applied
    const fresh: any = await (this.db.order as any).findUnique({
      where: { id: orderId },
    });

    // ── 3. Validate required RedX fields ────────────────────────────────────
    const areaId: number | undefined = fresh.deliveryAreaId ?? dto.deliveryAreaId;
    if (!areaId) {
      throw new BadRequestException(
        'delivery_area_id is required before pushing to RedX. Select a delivery area.',
      );
    }

    const areaName: string =
      fresh.deliveryAreaName ?? dto.deliveryAreaName ?? 'Unknown Area';

    // ── 4. Generate invoice number if not already set ────────────────────────
    let invoiceNumber: string = (fresh as any).invoiceNumber;
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

    const shipment = await this.redxService.createParcel(parcelPayload, shop.redxToken);

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
    const rawData = (order.rawExtract ?? fresh.rawExtract) as any;
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
          this.logger.warn(`Could not send tracking message to ${rawData.psid}: ${err.message}`),
        );
    }

    // ── 9. Notify customer via Email ────────────────────────────
    if (updatedOrder.customer?.email && shop) {
      const trackingUrl = `https://redx.com.bd/track-parcel/?trackingId=${shipment.trackingId}`;
      this.emailService.sendShippingUpdate(updatedOrder.customer.email, updatedOrder, shop.name, trackingUrl).catch(err =>
        this.logger.warn(`Failed to send shipping email for order ${orderId}: ${err.message}`)
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

    if (dto.customerName || dto.customerPhone || dto.customerAddress || dto.totalAmount !== undefined) {
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

    const freshOrder = await this.db.order.findUnique({ where: { id: orderId } });

    const shop = await (this.db.shop as any).findUnique({
      where: { id: shopId },
      select: { courierProvider: true, courierApiKey: true, courierSecretKey: true },
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

    this.logger.log(`Order ${orderId} pushed to ${shipment.courier}. Consignment: ${shipment.consignmentId}`);

    // Notify customer via Email
    if (updatedOrder.customer?.email && shop) {
      this.emailService.sendShippingUpdate(updatedOrder.customer.email, updatedOrder, shop.name).catch(err =>
        this.logger.warn(`Failed to send shipping email for order ${orderId}: ${err.message}`)
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

    const [orders, totalConversations, repeatsData, withOrdersCount] = await Promise.all([
      this.db.order.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.conversation.count({
        where: { shopId },
      }),
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
      this.db.order.groupBy({
        by: ['customerId'],
        where: {
          shopId,
          customerId: { not: null },
        },
      }),
    ]);

    const totalRevenue = orders.reduce(
      (sum: number, o: any) => sum + (Number(o.totalPrice) || 0),
      0,
    );
    const totalOrders = orders.length;
    const activeOrders = orders.filter(
      (o: any) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.status !== 'RETURNED',
    ).length;

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Customer Retention: % of customers with > 1 order
    const repeatCustomers = repeatsData.length;
    const customerRetention = withOrdersCount.length > 0
      ? (repeatCustomers / withOrdersCount.length) * 100
      : 0;

    // Conversion Rate: Orders / Conversations
    const conversionRate = totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0;

    // Traffic Source Distribution
    const trafficSource = {
      AI: orders.filter((o) => o.source === 'AI').length,
      MANUAL: orders.filter((o) => o.source === 'MANUAL').length,
      WEB: orders.filter((o) => o.source === 'WEB').length,
    };

    // Recent 5 orders for dashboard
    const recentOrders = orders.slice(0, 5);

    // Calculate Monthly Revenue (Last 6 Months)
    const revenueChart = new Array(6)
      .fill(0)
      .map((_, i) => {
        const d = new Date();
        d.setMonth(now.getMonth() - (5 - i));
        return {
          month: d.toLocaleString('default', { month: 'short' }),
          value: 0,
        };
      });

    orders.forEach((o: any) => {
      const date = new Date(o.createdAt);
      const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 +
        (now.getMonth() - date.getMonth());
      if (diffMonths >= 0 && diffMonths < 6) {
        revenueChart[5 - diffMonths].value += Number(o.totalPrice) || 0;
      }
    });

    // Order Status Distribution for Pie Chart
    const statusMap = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const orderStatusDistribution = Object.entries(statusMap).map(([name, value]) => ({
      name,
      value,
    }));

    return {
      totalRevenue,
      activeOrders,
      totalOrders,
      avgOrderValue,
      customerRetention,
      conversionRate,
      trafficSource,
      recentOrders,
      revenueChart,
      orderStatusDistribution,
    };
  }

  async remove(id: string, shopId: string) {
    return this.db.order.deleteMany({
      where: { id, shopId },
    });
  }
}
