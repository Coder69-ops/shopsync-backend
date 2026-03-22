import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseService } from '../database/database.service';

import { encrypt } from '../common/utils/encryption.util';

@Controller('integration/woocommerce')
@UseGuards(JwtAuthGuard)
export class WooCommerceController {
  constructor(
    private readonly wooCommerceService: WooCommerceService,
    private readonly db: DatabaseService,
  ) {}

  @Post('connect')
  async connect(
    @Request() req: any,
    @Body() body: { url: string; consumerKey: string; consumerSecret: string },
  ) {
    // Save to DB
    const shop = await this.db.shop.findUnique({
      where: { id: req.user.shopId },
    });
    if (!shop) throw new BadRequestException('Shop not found');
    const platformIds = (shop.platformIds as any) || {};
    platformIds.woocommerce = true;

    const baseUrl = body.url.replace(/\/$/, '').trim();
    const encryptedKey = encrypt(body.consumerKey);
    const encryptedSecret = encrypt(body.consumerSecret);

    await (this.db.shop as any).update({
      where: { id: req.user.shopId },
      data: {
        wooCommerceUrl: baseUrl,
        wooCommerceKey: encryptedKey,
        wooCommerceSecret: encryptedSecret,
        platformIds,
      },
    });

    try {
      // Test the connection
      const success = await this.wooCommerceService.testConnection(
        req.user.shopId,
      );
      if (!success) throw new Error('Connection test failed');
      return { success: true };
    } catch (error) {
      // Rollback if failed
      await (this.db.shop as any).update({
        where: { id: req.user.shopId },
        data: {
          wooCommerceUrl: null,
          wooCommerceKey: null,
          wooCommerceSecret: null,
        },
      });
      throw new BadRequestException(
        'Failed to connect to WooCommerce verify your credentials.',
      );
    }
  }
}
