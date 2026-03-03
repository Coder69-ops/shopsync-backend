import { Controller, Post, Body, UseGuards, Request, Get, Query, Res, BadRequestException, Delete, Param } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { ConnectWooCommerceDto } from './dto/connect-woocommerce.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';

@Controller('integration')
export class IntegrationController {
    constructor(private readonly integrationService: IntegrationService) { }

    @UseGuards(JwtAuthGuard)
    @Post('woocommerce/connect')
    async connectWooCommerce(@Request() req: any, @Body() dto: ConnectWooCommerceDto) {
        const shopId = req.user.shopId;
        return this.integrationService.connectWooCommerce(shopId, dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('shopify/auth')
    async shopifyAuth(@Request() req: any, @Query('shopDomain') shopDomain: string) {
        if (!shopDomain) throw new BadRequestException('shopDomain is required');
        const shopId = req.user.shopId;
        const url = await this.integrationService.getShopifyAuthUrl(shopId, shopDomain);
        return { url };
    }

    @Get('shopify/callback')
    async shopifyCallback(@Query() query: any, @Res() res: Response) {
        const redirectUrl = await this.integrationService.handleShopifyCallback(query);
        return res.redirect(redirectUrl);
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':platform/disconnect')
    async disconnectPlatform(@Request() req: any, @Param('platform') platform: string) {
        const shopId = req.user.shopId;
        return this.integrationService.disconnectPlatform(shopId, platform);
    }

    @UseGuards(JwtAuthGuard)
    @Post(':platform/sync')
    async forceSync(@Request() req: any, @Param('platform') platform: string) {
        const shopId = req.user.shopId;
        return this.integrationService.forceSync(shopId, platform);
    }
}
