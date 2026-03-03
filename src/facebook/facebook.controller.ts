import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FacebookService } from './facebook.service';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('facebook')
export class FacebookController {
  constructor(
    private readonly facebookService: FacebookService,
    private readonly db: DatabaseService,
  ) { }

  @UseGuards(JwtAuthGuard)
  @Get('pages')
  async getPages(@Query('shortLivedToken') shortLivedToken: string) {
    if (!shortLivedToken) {
      throw new HttpException(
        'Short-lived token is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const longLivedToken =
        await this.facebookService.exchangeForLongLivedToken(shortLivedToken);
      const pages = await this.facebookService.getManagedPages(longLivedToken);
      return pages;
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to fetch pages',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('exchange-code')
  async exchangeCode(@Body('code') code: string) {
    if (!code) {
      throw new HttpException('Code is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const accessToken =
        await this.facebookService.exchangeCodeForAccessToken(code);
      return { accessToken };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to exchange code',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  async connectPage(
    @CurrentUser('id') userId: string,
    @Body()
    body: {
      pageId: string;
      pageAccessToken: string;
      pageName?: string;
    },
  ) {
    if (!body.pageId || !body.pageAccessToken) {
      throw new HttpException(
        'Page ID and Access Token are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const trimmedPageId = String(body.pageId).trim();

    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { shop: true },
    });

    if (!user || !user.shopId) {
      throw new HttpException('User or Shop not found', HttpStatus.NOT_FOUND);
    }

    const currentPlatformIds = ((user.shop?.platformIds as any) || {}) as Record<string, any>;
    const currentPageId = currentPlatformIds.facebook;

    if (currentPageId && currentPageId !== trimmedPageId) {
      throw new HttpException(
        'A different Facebook Page is already connected. Disconnect before connecting another.',
        HttpStatus.CONFLICT,
      );
    }

    // Global Uniqueness Check: Ensure no OTHER shop has this page linked
    const existingShopWithPage = await this.db.shop.findFirst({
      where: {
        id: { not: user.shopId },
        platformIds: {
          path: ['facebook'],
          equals: trimmedPageId,
        },
      },
    });

    if (existingShopWithPage) {
      throw new HttpException(
        'This Facebook page is already connected to another ShopSync account.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.db.shop.update({
      where: { id: user.shopId },
      data: {
        platformIds: {
          ...currentPlatformIds,
          facebook: trimmedPageId,
        },
        accessToken: body.pageAccessToken,
      },
    });

    await this.db.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });

    const pageLabel = body.pageName || trimmedPageId;

    return {
      success: true,
      message: `Facebook page ${pageLabel} connected successfully`,
    };
  }
}
