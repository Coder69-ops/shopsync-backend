import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { DatabaseService } from '../database/database.service';
import { decrypt } from '../common/utils/encryption.util';

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Helper to build a WooCommerce API client for a specific shop
   */
  private buildClient(
    wooCommerceUrl: string,
    wooCommerceKey: string,
    wooCommerceSecret: string,
  ): AxiosInstance {
    if (!wooCommerceUrl || !wooCommerceKey || !wooCommerceSecret) {
      throw new BadRequestException('WooCommerce credentials are missing.');
    }

    const decryptedKey = decrypt(wooCommerceKey);
    const decryptedSecret = decrypt(wooCommerceSecret);

    // Ensure URL does not end with a trailing slash for consistency
    const baseUrl = wooCommerceUrl.replace(/\/$/, '');

    return axios.create({
      baseURL: `${baseUrl}/wp-json/wc/v3`,
      auth: {
        username: decryptedKey,
        password: decryptedSecret,
      },
      timeout: 15000,
    });
  }

  /**
   * Test the connection to WooCommerce by fetching basic store parameters
   * or a single product.
   */
  async testConnection(shopId: string): Promise<boolean> {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (
      !shop ||
      !shop.wooCommerceUrl ||
      !shop.wooCommerceKey ||
      !shop.wooCommerceSecret
    ) {
      throw new BadRequestException(
        'Please configure WooCommerce settings first.',
      );
    }

    const client = this.buildClient(
      shop.wooCommerceUrl,
      shop.wooCommerceKey,
      shop.wooCommerceSecret,
    );

    try {
      // Just check the system status or fetch 1 product to verify credentials
      await client.get('/system_status');
      return true;
    } catch (error: any) {
      this.logger.error(
        `WooCommerce connection test failed for shop ${shopId}: ${error?.message}`,
      );
      // Fallback: system_status requires specific permissions, let's try a simple products fetch
      try {
        await client.get('/products?per_page=1');
        return true;
      } catch (innerError: any) {
        this.logger.error(
          `WooCommerce connection fallback test failed for shop ${shopId}: ${innerError?.message}`,
        );
        throw new InternalServerErrorException(
          'Failed to connect to WooCommerce. Please check your credentials and URL.',
        );
      }
    }
  }

  /**
   * Perform an initial bulk fetch of all products from WooCommerce using pagination
   * and save them to the ShopSync database.
   */
  async syncProducts(shopId: string): Promise<{ syncedCount: number }> {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (
      !shop ||
      !shop.wooCommerceUrl ||
      !shop.wooCommerceKey ||
      !shop.wooCommerceSecret
    ) {
      throw new BadRequestException(
        'Please configure WooCommerce settings first.',
      );
    }

    const client = this.buildClient(
      shop.wooCommerceUrl,
      shop.wooCommerceKey,
      shop.wooCommerceSecret,
    );

    let page = 1;
    let syncedCount = 0;
    let hasMore = true;

    this.logger.log(`Starting WooCommerce product sync for shop ${shopId}`);

    while (hasMore) {
      try {
        const response = await client.get(`/products`, {
          params: {
            page,
            per_page: 50,
            status: 'publish', // We only want published items
          },
        });

        const products = response.data;
        if (!products || products.length === 0) {
          hasMore = false;
          break;
        }

        // Upsert each product into the database
        await this.db.$transaction(async (tx) => {
          for (const p of products) {
            // Check if product already exists by externalId to avoid duplicates
            await tx.product.upsert({
              where: {
                shopId_platform_externalId: {
                  shopId,
                  platform: 'WOOCOMMERCE',
                  externalId: String(p.id),
                },
              },
              update: {
                name: p.name,
                price: parseFloat(p.price || p.regular_price || '0'),
                stock: p.stock_quantity || (p.manage_stock ? 0 : 999), // default for unlimited
                sku: p.sku || null,
                imageUrl: p.images?.[0]?.src || null,
                description:
                  p.short_description ||
                  p.description?.replace(/(<([^>]+)>)/gi, '') ||
                  null,
                externalUrl: p.permalink,
                isActive: p.status === 'publish',
              },
              create: {
                shopId,
                name: p.name,
                price: parseFloat(p.price || p.regular_price || '0'),
                stock: p.stock_quantity || (p.manage_stock ? 0 : 999),
                sku: p.sku || null,
                category: p.categories?.[0]?.name || 'Uncategorized',
                imageUrl: p.images?.[0]?.src || null,
                description:
                  p.short_description ||
                  p.description?.replace(/(<([^>]+)>)/gi, '') ||
                  null,
                platform: 'WOOCOMMERCE',
                externalId: String(p.id),
                externalUrl: p.permalink,
                isActive: p.status === 'publish',
              },
            });
            syncedCount++;
          }
        });

        const totalPages = parseInt(
          response.headers['x-wp-totalpages'] || '1',
          10,
        );
        if (page >= totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error: any) {
        this.logger.error(
          `Error syncing WooCommerce products (page ${page}) for shop ${shopId}:`,
          error?.message,
        );
        throw new InternalServerErrorException(
          `Product sync failed on page ${page}. Check API limits or connectivity.`,
        );
      }
    }

    this.logger.log(
      `Completed WooCommerce product sync for shop ${shopId}. Total synced: ${syncedCount}`,
    );
    return { syncedCount };
  }

  /**
   * Push an order from ShopSync back to WooCommerce.
   * This ensures the website inventory deducts stock and the merchant sees the order.
   */
  async pushOrder(
    shop: any,
    order: any,
    orderItems: any[],
  ): Promise<string | null> {
    if (
      !shop.wooCommerceUrl ||
      !shop.wooCommerceKey ||
      !shop.wooCommerceSecret
    ) {
      return null; // Not configured, silently skip
    }

    const client = this.buildClient(
      shop.wooCommerceUrl,
      shop.wooCommerceKey,
      shop.wooCommerceSecret,
    );

    try {
      // Map ShopSync Order & Items to WooCommerce Order payload
      const lineItems = orderItems
        .filter(
          (item) =>
            item.product?.platform === 'WOOCOMMERCE' &&
            item.product?.externalId,
        )
        .map((item) => ({
          product_id: parseInt(item.product.externalId, 10),
          quantity: item.quantity,
          total: String(item.total || item.unitPrice * item.quantity),
        }));

      if (lineItems.length === 0) {
        return null; // No WooCommerce products in this order
      }

      const payload: any = {
        set_paid: false,
        status: 'processing', // or 'pending'
        billing: {
          first_name: order.customerName || 'ShopSync Customer',
          address_1: order.customerAddress || 'Requested via Inbox',
          phone: order.customerPhone || '',
          email: order.customer?.email || '',
        },
        shipping: {
          first_name: order.customerName || 'ShopSync Customer',
          address_1: order.customerAddress || 'Requested via Inbox',
        },
        line_items: lineItems,
        shipping_lines: [
          {
            method_id: 'flat_rate',
            method_title: 'Delivery Fee',
            total: String(order.deliveryFee || '0'),
          },
        ],
        customer_note: order.serviceNotes || 'Created via ShopSync AI',
      };

      const response = await client.post('/orders', payload);
      if (response.data && response.data.id) {
        this.logger.log(
          `Created WooCommerce order #${response.data.id} for internal order ${order.id}`,
        );
        return String(response.data.id);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to push order ${order.id} to WooCommerce: ${error?.response?.data?.message || error?.message}`,
      );
    }

    return null;
  }
}
