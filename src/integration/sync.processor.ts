import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { EmbeddingsService } from './embeddings.service';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { decrypt } from '../common/utils/encryption.util';

@Processor('sync-queue')
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { shopId, platform } = job.data;
    this.logger.log(`Starting bulk sync for Shop ${shopId} via ${platform}`);

    try {
      const shop = await this.db.shop.findUnique({ where: { id: shopId } });
      if (!shop || !shop.platformIds)
        throw new Error('Shop credentials not found');

      if (platform === 'WOOCOMMERCE') {
        const credentials = {
          url:
            shop.wooCommerceUrl || (shop.platformIds as any)?.woocommerce?.url,
          consumerKey:
            shop.wooCommerceKey ||
            (shop.platformIds as any)?.woocommerce?.consumerKey,
          consumerSecret:
            shop.wooCommerceSecret ||
            (shop.platformIds as any)?.woocommerce?.consumerSecret,
        };
        if (!credentials.url || !credentials.consumerKey)
          throw new Error('WooCommerce credentials missing');
        await this.syncWooCommerce(shopId, credentials);
      } else if (platform === 'SHOPIFY') {
        const credentials = {
          shopDomain:
            shop.shopifyUrl?.replace(/^https?:\/\//, '') ||
            (shop.platformIds as any)?.shopify?.shopDomain,
          accessToken:
            shop.shopifyAccessToken ||
            (shop.platformIds as any)?.shopify?.accessToken,
        };
        if (!credentials.shopDomain || !credentials.accessToken)
          throw new Error('Shopify credentials missing');
        await this.syncShopify(shopId, credentials);
      }

      this.logger.log(`Completed bulk sync for Shop ${shopId}`);
    } catch (error: any) {
      this.logger.error(`Sync failed for ${shopId}: ${error.message}`);
      throw error;
    }
  }

  private async syncWooCommerce(shopId: string, credentials: any) {
    const { url, consumerKey, consumerSecret } = credentials;
    const decryptedKey = decrypt(consumerKey);
    const decryptedSecret = decrypt(consumerSecret);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${url}/wp-json/wc/v3/products`, {
        params: { per_page: 50, page },
        auth: { username: decryptedKey, password: decryptedSecret },
      });

      const products = response.data;
      if (products.length === 0) {
        hasMore = false;
        break;
      }

      for (const p of products) {
        await this.upsertProduct(shopId, 'WOOCOMMERCE', {
          externalId: p.id.toString(),
          name: p.name,
          price: parseFloat(p.price || p.regular_price || 0),
          stock: p.stock_quantity || (p.in_stock ? 100 : 0),
          description:
            p.short_description?.replace(/(<([^>]+)>)/gi, '') ||
            p.description?.replace(/(<([^>]+)>)/gi, ''),
          externalUrl: p.permalink,
          imageUrl: p.images?.[0]?.src,
        });
      }

      const totalPages = parseInt(response.headers['x-wp-totalpages'], 10) || 1;
      if (page >= totalPages) hasMore = false;
      page++;
    }
  }

  private async syncShopify(shopId: string, credentials: any) {
    const { shopDomain, accessToken } = credentials;
    const decryptedToken = decrypt(accessToken);

    let url: string | null =
      `https://${shopDomain}/admin/api/2024-04/products.json?limit=250`;

    while (url) {
      const response = await axios.get(url, {
        headers: { 'X-Shopify-Access-Token': decryptedToken },
      });

      const products = response.data.products || [];
      for (const p of products) {
        const priceStr = p.variants?.[0]?.price || '0';
        const stock = p.variants?.[0]?.inventory_quantity || 0;

        await this.upsertProduct(shopId, 'SHOPIFY', {
          externalId: p.id.toString(),
          name: p.title,
          price: parseFloat(priceStr),
          stock,
          description: p.body_html?.replace(/(<([^>]+)>)/gi, ''),
          externalUrl: `https://${shopDomain}/products/${p.handle}`,
          imageUrl: p.image?.src,
        });
      }

      // Check for next page in Link header
      const linkHeader = response.headers['link'] as string;
      url = null; // Default to break loop

      if (linkHeader) {
        const links = linkHeader.split(',').map((part) => part.trim());
        for (const link of links) {
          if (link.includes('rel="next"')) {
            const match = link.match(/<(.*?)>/);
            if (match && match[1]) {
              url = match[1];
            }
          }
        }
      }
    }
  }

  private async upsertProduct(
    shopId: string,
    platform: 'WOOCOMMERCE' | 'SHOPIFY',
    data: any,
  ) {
    // Generate vector embedding
    const textToEmbed = `Product Name: ${data.name}. Description: ${data.description || ''}`;
    const embeddingValues =
      await this.embeddingsService.generateEmbedding(textToEmbed);

    // Prisma pgvector requires executing raw sql for upserting with embeddings or using explicit cast
    // If the embedding array is empty, we set it to null
    const vectorString =
      embeddingValues.length > 0 ? `[${embeddingValues.join(',')}]` : null;

    if (vectorString) {
      // Because `embedding` is an Unsupported("vector"), we must use raw queries to correctly type cast it.
      await this.db.$executeRaw`
        INSERT INTO "Product" (
          "id", "shopId", "platform", "externalId", "externalUrl", 
          "name", "price", "stock", "description", "imageUrl", "embedding", "updatedAt"
        )
        VALUES (
          gen_random_uuid(), ${shopId}, ${platform}::"PlatformType", ${data.externalId}, ${data.externalUrl}, 
          ${data.name}, ${data.price}, ${data.stock}, ${data.description}, ${data.imageUrl}, 
          ${vectorString}::vector, NOW()
        )
        ON CONFLICT ("shopId", "platform", "externalId") DO UPDATE SET
          "name" = EXCLUDED."name",
          "price" = EXCLUDED."price",
          "stock" = EXCLUDED."stock",
          "description" = EXCLUDED."description",
          "imageUrl" = EXCLUDED."imageUrl",
          "embedding" = EXCLUDED."embedding",
          "updatedAt" = NOW()
      `;
    } else {
      // Standard upsert fallback without embeddings
      await this.db.product.upsert({
        where: {
          shopId_platform_externalId: {
            shopId,
            platform,
            externalId: data.externalId,
          },
        },
        update: Object.assign({}, data),
        create: {
          shopId,
          platform,
          ...data,
        },
      });
    }
  }

  async processWebhook(
    shopId: string,
    platform: 'WOOCOMMERCE' | 'SHOPIFY',
    topic: string,
    payload: any,
  ) {
    this.logger.log(
      `Processing real-time sync for ${platform} shop ${shopId}: ${topic}`,
    );

    const action =
      platform === 'WOOCOMMERCE' ? topic.split('.')[1] : topic.split('/')[1];

    if (action === 'deleted' || action === 'delete') {
      const externalId = (payload.id || payload.ID).toString();
      await this.db.product.deleteMany({
        where: { shopId, platform, externalId },
      });
      return;
    }

    let productData: any = {};
    if (platform === 'WOOCOMMERCE') {
      productData = {
        externalId: payload.id.toString(),
        name: payload.name,
        price: parseFloat(payload.price || payload.regular_price || 0),
        stock: payload.stock_quantity || (payload.in_stock ? 100 : 0),
        description:
          payload.short_description?.replace(/(<([^>]+)>)/gi, '') ||
          payload.description?.replace(/(<([^>]+)>)/gi, ''),
        externalUrl: payload.permalink,
        imageUrl: payload.images?.[0]?.src,
      };
    } else {
      const priceStr = payload.variants?.[0]?.price || '0';
      const stock = payload.variants?.[0]?.inventory_quantity || 0;

      const dbShop = await this.db.shop.findUnique({ where: { id: shopId } });
      const platformIds = (dbShop?.platformIds as any) || {};
      const shopDomain =
        platformIds['shopify']?.shopDomain || 'store.myshopify.com';

      productData = {
        externalId: payload.id.toString(),
        name: payload.title,
        price: parseFloat(priceStr),
        stock,
        description: payload.body_html?.replace(/(<([^>]+)>)/gi, ''),
        externalUrl: `https://${shopDomain}/products/${payload.handle}`,
        imageUrl: payload.image?.src,
      };
    }

    await this.upsertProduct(shopId, platform, productData);
  }
}
