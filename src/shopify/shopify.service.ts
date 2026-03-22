import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { DatabaseService } from '../database/database.service';
import { decrypt, encrypt } from '../common/utils/encryption.util';

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get or refresh Shopify Admin API Access Token using Client Credentials grant
   */
  private async getAccessToken(shop: any): Promise<string> {
    // If it's a manual Access Token (Custom App), just decrypt and return
    if (shop.shopifyAccessToken && !shop.shopifyClientId) {
      return decrypt(shop.shopifyAccessToken);
    }

    // Check if cached token is still valid (using 5-minute buffer)
    if (
      shop.shopifyAccessToken &&
      shop.shopifyAccessTokenExpiresAt &&
      new Date(shop.shopifyAccessTokenExpiresAt).getTime() > Date.now() + 300000
    ) {
      return decrypt(shop.shopifyAccessToken);
    }

    // Need to refresh token using Client Credentials
    if (
      !shop.shopifyClientId ||
      !shop.shopifyClientSecret ||
      !shop.shopifyUrl
    ) {
      throw new BadRequestException(
        'Shopify Partner App credentials (Client ID/Secret) are missing.',
      );
    }

    this.logger.log(`Refreshing Shopify access token for shop: ${shop.id}`);

    try {
      const shopDomain = shop.shopifyUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: shop.shopifyClientId,
        client_secret: decrypt(shop.shopifyClientSecret),
      });

      const response = await axios.post(
        `https://${shopDomain}/admin/oauth/access_token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const { access_token, expires_in } = response.data;
      const encryptedToken = encrypt(access_token);
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      // Update DB with new token
      await this.db.shop.update({
        where: { id: shop.id },
        data: {
          shopifyAccessToken: encryptedToken,
          shopifyAccessTokenExpiresAt: expiresAt,
        },
      });

      return access_token;
    } catch (error: any) {
      this.logger.error(
        `Failed to refresh Shopify token for shop ${shop.id}: ${error?.response?.data ? JSON.stringify(error.response.data) : error?.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to authenticate with Shopify using Partner credentials.',
      );
    }
  }

  /**
   * Helper to build a Shopify API client for a specific shop
   */
  private buildClient(shopifyUrl: string, accessToken: string): AxiosInstance {
    const decryptedToken = accessToken; // Now passed as plain text from getAccessToken

    // Ensure URL does not end with a trailing slash and extract the myshopify domain
    let baseUrl = shopifyUrl.replace(/\/$/, '');
    if (!baseUrl.includes('myshopify.com')) {
      baseUrl = `${baseUrl}.myshopify.com`;
    }
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }

    return axios.create({
      baseURL: `${baseUrl}/admin/api/2025-01`, // Use a stable API version
      headers: {
        'X-Shopify-Access-Token': decryptedToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  /**
   * Test the connection to Shopify by fetching basic store parameters
   */
  async testConnection(shopId: string): Promise<boolean> {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.shopifyUrl) {
      throw new BadRequestException('Please configure Shopify settings first.');
    }

    const accessToken = await this.getAccessToken(shop);
    const client = this.buildClient(shop.shopifyUrl, accessToken);

    try {
      await client.get('/shop.json');
      return true;
    } catch (error: any) {
      this.logger.error(
        `Shopify connection test failed for shop ${shopId}: ${error?.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to connect to Shopify. Please check your token and URL.',
      );
    }
  }

  /**
   * Perform an initial bulk fetch of all products from Shopify using cursor-based pagination
   * and save them to the ShopSync database.
   */
  async syncProducts(shopId: string): Promise<{ syncedCount: number }> {
    const shop = await this.db.shop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.shopifyUrl) {
      throw new BadRequestException('Please configure Shopify settings first.');
    }

    const accessToken = await this.getAccessToken(shop);
    const client = this.buildClient(shop.shopifyUrl, accessToken);

    let syncedCount = 0;
    let pageInfo: string | null = null;
    let hasMore = true;

    this.logger.log(`Starting Shopify product sync for shop ${shopId}`);

    while (hasMore) {
      try {
        const params: any = { limit: 50, status: 'active' };
        if (pageInfo) {
          params.page_info = pageInfo;
        }

        const response = await client.get(`/products.json`, { params });

        const products = response.data.products;
        if (!products || products.length === 0) {
          hasMore = false;
          break;
        }

        // Upsert each product into the database
        await this.db.$transaction(async (tx) => {
          for (const p of products) {
            // Shopify products have multiple variants. We use the first variant or calculate a base price.
            const firstVariant = p.variants?.[0];
            const price = parseFloat(firstVariant?.price || '0');
            const stock = firstVariant?.inventory_management
              ? firstVariant?.inventory_quantity || 0
              : 999;
            const sku = firstVariant?.sku || null;
            const imageUrl = p.image?.src || null;

            // Generate external URL (approximate based on handle)
            const sUrl = shop.shopifyUrl as string;
            let baseShopUrl = sUrl.startsWith('http')
              ? sUrl
              : `https://${sUrl}`;
            if (!baseShopUrl.includes('myshopify.com'))
              baseShopUrl = `https://${baseShopUrl}.myshopify.com`;
            const externalUrl = `${baseShopUrl}/products/${p.handle}`;

            // Shopify Orders strictly require 'variant_id' not 'product_id'.
            const externalIdStr = String(firstVariant?.id || p.id);

            await tx.product.upsert({
              where: {
                shopId_platform_externalId: {
                  shopId,
                  platform: 'SHOPIFY',
                  externalId: externalIdStr,
                },
              },
              update: {
                name: p.title,
                price: price,
                stock: stock,
                sku: sku,
                imageUrl: imageUrl,
                description: p.body_html?.replace(/(<([^>]+)>)/gi, '') || null,
                externalUrl: externalUrl,
                isActive: p.status === 'active',
              },
              create: {
                shopId,
                name: p.title,
                price: price,
                stock: stock,
                sku: sku,
                category: p.product_type || 'Uncategorized',
                imageUrl: imageUrl,
                description: p.body_html?.replace(/(<([^>]+)>)/gi, '') || null,
                platform: 'SHOPIFY',
                externalId: externalIdStr,
                externalUrl: externalUrl,
                isActive: p.status === 'active',
              },
            });
            syncedCount++;
          }
        });

        // Parse Shopify's Link header for pagination
        const linkHeader = response.headers['link'] as string;
        if (linkHeader && linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(
            /<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/,
          );
          if (match && match[1]) {
            pageInfo = match[1];
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        this.logger.error(
          `Error syncing Shopify products for shop ${shopId}:`,
          error?.message,
        );
        throw new InternalServerErrorException(
          `Product sync failed. Check API limits or connectivity.`,
        );
      }
    }

    this.logger.log(
      `Completed Shopify product sync for shop ${shopId}. Total synced: ${syncedCount}`,
    );
    return { syncedCount };
  }

  /**
   * Push an order from ShopSync back to Shopify.
   * This ensures the website inventory deducts stock and the merchant sees the order.
   */
  async pushOrder(
    shop: any,
    order: any,
    orderItems: any[],
  ): Promise<string | null> {
    if (!shop.shopifyUrl) {
      return null; // Not configured
    }

    try {
      const accessToken = await this.getAccessToken(shop);
      const client = this.buildClient(shop.shopifyUrl, accessToken);

      const lineItems = orderItems
        .filter(
          (item) =>
            item.product?.platform === 'SHOPIFY' && item.product?.externalId,
        )
        .map((item) => ({
          variant_id: parseInt(item.product.externalId, 10), // Assuming externalId maps to variant id or product id
          quantity: item.quantity,
          price: String(item.unitPrice),
        }));

      if (lineItems.length === 0) {
        return null;
      }

      const payload: any = {
        order: {
          email: order.customer?.email || undefined,
          phone: order.customerPhone || undefined,
          billing_address: {
            name: order.customerName || 'ShopSync Customer',
            address1: order.customerAddress || 'Requested via Inbox',
            phone: order.customerPhone || undefined,
          },
          shipping_address: {
            name: order.customerName || 'ShopSync Customer',
            address1: order.customerAddress || 'Requested via Inbox',
            phone: order.customerPhone || undefined,
          },
          line_items: lineItems,
          shipping_lines: [
            {
              title: 'Delivery Fee',
              price: String(order.deliveryFee || '0'),
              code: 'Delivery',
            },
          ],
          financial_status: 'pending',
          note: order.serviceNotes || 'Generated via ShopSync AI',
          tags: 'ShopSync',
        },
      };

      const response = await client.post('/orders.json', payload);
      if (response.data && response.data.order?.id) {
        this.logger.log(
          `Created Shopify order #${response.data.order.id} for internal order ${order.id}`,
        );
        return String(response.data.order.id);
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to push order ${order.id} to Shopify: ${JSON.stringify(error?.response?.data) || error?.message}`,
      );
    }

    return null;
  }
}
