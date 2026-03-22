import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { FacebookService } from './facebook.service';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Logger } from '@nestjs/common';

@Controller('facebook')
export class FacebookController {
  private readonly logger = new Logger(FacebookController.name);

  constructor(
    private readonly facebookService: FacebookService,
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
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

  @Get('connect')
  async facebookConnect(
    @Query('type') type: 'onboarding' | 'integrations',
    @Res() res: Response,
  ) {
    const url = await this.facebookService.getFacebookConnectUrl(
      type || 'integrations',
    );
    return res.redirect(url);
  }

  @Get('callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('type') type: string,
    @Res() res: Response,
  ) {
    try {
      const backendUrl =
        this.configService.get<string>('BACKEND_URL') ||
        'https://api.shopsync.it.com';
      const redirectUri = `${backendUrl}/facebook/callback?type=${type}`;

      const accessToken =
        await this.facebookService.exchangeCodeForAccessToken(
          code,
          redirectUri,
        );

      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'https://shopsync.it.com';
      const targetPath = type === 'onboarding' ? '/onboarding' : '/integrations';

      return res.redirect(`${frontendUrl}${targetPath}?fb_token=${accessToken}`);
    } catch (error) {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'https://shopsync.it.com';
      const targetPath = type === 'onboarding' ? '/onboarding' : '/integrations';
      return res.redirect(`${frontendUrl}${targetPath}?error=facebook_connect_failed`);
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

    // Technique 1: The Silver Bullet (Facebook Page ID Tracking)
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
      // If the older shop is still active and NOT scheduled for deletion, block to prevent multi-shop overlap
      if (!existingShopWithPage.isDeletionScheduled && existingShopWithPage.isActive) {
        throw new HttpException(
          'This Facebook page is already connected to another active ShopSync account.',
          HttpStatus.CONFLICT,
        );
      }

      // If the older shop was deleted/scheduled, allow the new connection but mark as RECYCLED
      await this.db.shop.update({
        where: { id: user.shopId },
        data: { isRecycled: true },
      });

      this.logger.warn(
        `Recycled Facebook Page ID detected: ${trimmedPageId}. Commission for Shop ${user.shopId} will be bypassed.`,
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
