import { Controller, Post, Delete, Body, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { ShopifyService } from './shopify.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../database/database.service';

import { encrypt } from '../common/utils/encryption.util';

@Controller('integration/shopify')
@UseGuards(JwtAuthGuard)
export class ShopifyController {
    constructor(
        private readonly shopifyService: ShopifyService,
        private readonly db: DatabaseService
    ) { }



    @Post('connect')
    async connect(@Request() req: any, @Body() body: { url: string; accessToken?: string; clientId?: string; clientSecret?: string }) {
        const shop = await this.db.shop.findUnique({ where: { id: req.user.shopId } });
        if (!shop) throw new BadRequestException('Shop not found');

        const originalPlatformIds = (shop.platformIds as any) || {};
        const platformIds = { ...originalPlatformIds, shopify: true };

        const shopDomain = body.url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();

        if (body.accessToken) {
            // Flow 1: Custom App (Direct Access Token)
            if (!body.accessToken.startsWith('shpat_')) {
                if (body.accessToken.startsWith('shpss_')) {
                    throw new BadRequestException('You entered a Shopify API Secret Key (shpss_). Please use the Admin API Access Token (shpat_) instead.');
                }
                throw new BadRequestException('Invalid Shopify Admin API Access Token. It should start with "shpat_".');
            }

            const encryptedToken = encrypt(body.accessToken);

            await this.db.shop.update({
                where: { id: req.user.shopId },
                data: {
                    shopifyUrl: `https://${shopDomain}`,
                    shopifyAccessToken: encryptedToken,
                    shopifyClientId: null,
                    shopifyClientSecret: null,
                    shopifyAccessTokenExpiresAt: null,
                    platformIds
                }
            });
        } else if (body.clientId && body.clientSecret) {
            // Flow 2: Partner App (Client ID/Secret)
            const encryptedSecret = encrypt(body.clientSecret);

            await this.db.shop.update({
                where: { id: req.user.shopId },
                data: {
                    shopifyUrl: `https://${shopDomain}`,
                    shopifyClientId: body.clientId,
                    shopifyClientSecret: encryptedSecret,
                    shopifyAccessToken: null,
                    shopifyAccessTokenExpiresAt: null,
                    platformIds
                }
            });
        } else {
            throw new BadRequestException('Please provide either an Access Token or Client ID/Secret.');
        }

        try {
            const success = await this.shopifyService.testConnection(req.user.shopId);
            if (!success) throw new Error('Connection test failed');
            return { success: true };
        } catch (error: any) {
            // Rollback if failed
            await this.db.shop.update({
                where: { id: req.user.shopId },
                data: {
                    shopifyUrl: null,
                    shopifyAccessToken: null,
                    shopifyClientId: null,
                    shopifyClientSecret: null,
                    shopifyAccessTokenExpiresAt: null,
                    platformIds: originalPlatformIds
                }
            });
            throw new BadRequestException(error.message || 'Failed to connect to Shopify. Verify your credentials and URL.');
        }
    }
}
