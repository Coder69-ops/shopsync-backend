import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ConnectWooCommerceDto } from './dto/connect-woocommerce.dto';
import axios from 'axios';
import { encrypt, decrypt } from '../common/utils/encryption.util';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class IntegrationService {
    private readonly logger = new Logger(IntegrationService.name);

    constructor(
        private readonly db: DatabaseService,
        @InjectQueue('sync-queue') private readonly syncQueue: Queue,
    ) { }

    async connectWooCommerce(shopId: string, dto: ConnectWooCommerceDto) {
        try {
            const { url, consumerKey, consumerSecret } = dto;

            const baseUrl = url.replace(/\/$/, '').trim();
            const endpoint = `${baseUrl}/wp-json/wc/v3/system_status`;

            const response = await axios.get(endpoint, {
                auth: {
                    username: consumerKey,
                    password: consumerSecret,
                },
            });

            if (response.status !== 200) {
                throw new Error('WooCommerce API returned non-200 status');
            }

            const encryptedKey = encrypt(consumerKey);
            const encryptedSecret = encrypt(consumerSecret);

            const shop = await this.db.shop.findUnique({ where: { id: shopId } });
            if (!shop) throw new BadRequestException('Shop not found');

            const platformIds = (shop.platformIds as any) || {};
            platformIds['woocommerce'] = {
                url: baseUrl,
                consumerKey: encryptedKey,
                consumerSecret: encryptedSecret,
            };

            await this.db.shop.update({
                where: { id: shopId },
                data: {
                    wooCommerceUrl: baseUrl,
                    wooCommerceKey: encryptedKey,
                    wooCommerceSecret: encryptedSecret,
                    platformIds
                },
            });

            this.logger.log(`WooCommerce connected for shop ${shopId}`);
            await this.syncQueue.add('bulk-sync', { shopId, platform: 'WOOCOMMERCE' });

            return { success: true, message: 'WooCommerce connected successfully' };
        } catch (error: any) {
            this.logger.error(`WooCommerce connection failed: ${error.message}`);
            throw new BadRequestException('Failed to connect to WooCommerce. Please check your credentials and URL.');
        }
    }

    async getShopifyAuthUrl(shopId: string, shopDomain: string): Promise<string> {
        const clientId = process.env.SHOPIFY_CLIENT_ID;
        if (!clientId) throw new BadRequestException('Shopify client ID is not configured');

        // According to Shopify docs, scopes should be comma-separated or space-separated
        const scopes = 'read_products,write_products';
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://localhost:3002'; // HTTPS usually required for shopify
        const redirectUri = `${apiUrl}/integration/shopify/callback`;
        const state = shopId;

        const cleanShop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();

        return `https://${cleanShop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    }

    async handleShopifyCallback(query: any): Promise<string> {
        const { code, shop, state } = query;
        const shopId = state;

        if (!code || !shop || !state) {
            throw new BadRequestException('Invalid callback parameters');
        }

        try {
            const clientId = process.env.SHOPIFY_CLIENT_ID;
            const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

            if (!clientId || !clientSecret) throw new Error('Shopify credentials missing');

            const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
                client_id: clientId,
                client_secret: clientSecret,
                code,
            });

            const accessToken = response.data.access_token;
            const encryptedToken = encrypt(accessToken);

            const dbShop = await this.db.shop.findUnique({ where: { id: shopId } });
            if (!dbShop) throw new BadRequestException('Shop not found');

            const platformIds = (dbShop.platformIds as any) || {};
            platformIds['shopify'] = {
                shopDomain: shop,
                accessToken: encryptedToken,
            };

            await this.db.shop.update({
                where: { id: shopId },
                data: {
                    shopifyUrl: `https://${shop}`,
                    shopifyAccessToken: encryptedToken,
                    platformIds
                },
            });

            this.logger.log(`Shopify connected for shop ${shopId}`);
            await this.syncQueue.add('SYNC_PRODUCTS', { shopId, platform: 'SHOPIFY' });

            const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
            return `${frontendUrl}/dashboard?integration=success`;
        } catch (error: any) {
            this.logger.error(`Shopify callback failed: ${error.message}`);
            const frontendUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
            return `${frontendUrl}/dashboard?integration=error`;
        }
    }

    async disconnectPlatform(shopId: string, platform: string) {
        const pStr = platform.toLowerCase();
        if (pStr !== 'woocommerce' && pStr !== 'shopify') {
            throw new BadRequestException('Invalid platform');
        }

        const shop = await this.db.shop.findUnique({ where: { id: shopId } });
        if (!shop || !shop.platformIds) {
            return { success: true, message: 'Platform already disconnected' };
        }

        const platformIds = shop.platformIds as any;
        if (platformIds[pStr]) {
            delete platformIds[pStr];
            const updateData: any = { platformIds };
            if (pStr === 'woocommerce') {
                updateData.wooCommerceUrl = null;
                updateData.wooCommerceKey = null;
                updateData.wooCommerceSecret = null;
            } else if (pStr === 'shopify') {
                updateData.shopifyUrl = null;
                updateData.shopifyAccessToken = null;
            }

            await this.db.shop.update({
                where: { id: shopId },
                data: updateData
            });
            this.logger.log(`Disconnected ${platform} for shop ${shopId}`);

            // Note: In a production app, we would also unsubscribe existing webhooks from the platform here
        }

        return { success: true, message: `${platform} disconnected successfully` };
    }

    async forceSync(shopId: string, platform: string) {
        const pStr = platform.toLowerCase();
        if (pStr !== 'woocommerce' && pStr !== 'shopify') {
            throw new BadRequestException('Invalid platform');
        }

        const shop = await this.db.shop.findUnique({ where: { id: shopId } });
        if (!shop || !shop.platformIds) throw new BadRequestException('Platform not connected');

        const platformIds = (shop.platformIds as any) || {};
        const isConnected = platformIds[pStr] || (pStr === 'woocommerce' ? shop.wooCommerceUrl : shop.shopifyUrl);
        if (!isConnected) throw new BadRequestException('Platform not connected');

        await this.syncQueue.add('bulk-sync', { shopId, platform: pStr.toUpperCase() });
        this.logger.log(`Manual sync triggered for ${platform} shop ${shopId}`);
        return { success: true, message: `Sync job queued for ${platform}` };
    }
}
