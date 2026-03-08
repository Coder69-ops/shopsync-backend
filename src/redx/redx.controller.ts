import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    UseGuards,
    Req,
    Query,
    BadRequestException,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { RedxService } from './redx.service';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('courier/redx')
export class RedxController {
    constructor(
        private readonly redxService: RedxService,
        private readonly db: DatabaseService,
    ) { }

    /**
     * Fetch all pickup stores from RedX for the logged-in shop.
     */
    @Get('pickup-stores')
    @Get('pickup_stores')
    @UseGuards(JwtAuthGuard)
    async getPickupStores(@Req() req: any) {
        const shopId = req.user.shopId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });

        if (!shop?.redxToken) {
            throw new BadRequestException('RedX token not configured.');
        }

        return this.redxService.getPickupStores(shop.redxToken);
    }

    /**
     * Create a new pickup store in RedX.
     */
    @Post('pickup-store')
    @UseGuards(JwtAuthGuard)
    async createPickupStore(@Req() req: any, @Body() payload: any) {
        const shopId = req.user.shopId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });

        if (!shop?.redxToken) {
            throw new BadRequestException('RedX token not configured.');
        }

        return this.redxService.createPickupStore(payload, shop.redxToken);
    }

    /**
     * Update the default RedX pickup store ID for the shop.
     */
    @Patch('default-store')
    @UseGuards(JwtAuthGuard)
    async updateDefaultStore(@Req() req: any, @Body('storeId') storeId: string) {
        const shopId = req.user.shopId;

        await this.db.shop.update({
            where: { id: shopId },
            data: { redxStoreId: storeId },
        });

        return { success: true, redxStoreId: storeId };
    }

    /**
     * Fetch all RedX areas for store creation.
     */
    @Get('areas')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Fetch all RedX areas for store creation' })
    async getAreas(@Req() req: any) {
        const shopId = req.user.shopId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });
        if (!shop?.redxToken) throw new BadRequestException('RedX token not set');
        return this.redxService.getAreas(shop.redxToken);
    }

    /**
     * Public Tracking Endpoint (No Auth)
     */
    @Get('track/:trackingId')
    @ApiOperation({ summary: 'Public parcel tracking' })
    async publicTrack(@Req() req: any) {
        const trackingId = req.params.trackingId;
        // In a real app, you'd probably need one generic token or look up the shop by trackingId
        // For now, we'll try to find the order and use its shop's token
        const order = await this.db.order.findFirst({
            where: { trackingId },
            include: { shop: true }
        });

        if (!order || !order.shop?.redxToken) {
            throw new BadRequestException('Invalid tracking ID or untracked parcel.');
        }

        return this.redxService.trackParcel(trackingId, order.shop.redxToken);
    }

    /**
     * Get Parcel Label (Protected)
     */
    @Get('label/:trackingId')
    @UseGuards(JwtAuthGuard)
    async getLabel(@Req() req: any) {
        const shopId = req.user.shopId;
        const trackingId = req.params.trackingId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });
        if (!shop?.redxToken) throw new BadRequestException('RedX token not set');
        return this.redxService.getLabel(trackingId, shop.redxToken);
    }

    /**
     * Get Parcel Info (Protected)
     * Returns more detailed internal logs, including the collected COD amount.
     */
    @Get('info/:trackingId')
    @UseGuards(JwtAuthGuard)
    async getParcelInfo(@Req() req: any) {
        const shopId = req.user.shopId;
        const trackingId = req.params.trackingId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });
        if (!shop?.redxToken) throw new BadRequestException('RedX token not set');
        return this.redxService.getParcelInfo(trackingId, shop.redxToken);
    }

    /**
     * Charge Calculator (Protected)
     * Calculates exact delivery charge based on area and weight.
     */
    @Get('charge/charge_calculator')
    @UseGuards(JwtAuthGuard)
    async calculateCharge(
        @Req() req: any,
        @Query('delivery_area_id') deliveryAreaId: string,
        @Query('parcel_weight') parcelWeight: string
    ) {
        if (!deliveryAreaId || !parcelWeight) {
            throw new BadRequestException('delivery_area_id and parcel_weight are required');
        }

        const shopId = req.user.shopId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });

        if (!shop?.redxToken) throw new BadRequestException('RedX token not set');

        // Note: The service expects numbers
        return this.redxService.calculateCharge(
            Number(deliveryAreaId),
            Number(parcelWeight),
            shop.redxToken
        );
    }

    /**
     * Bulk Parcel Booking (Protected)
     */
    @Post('bulk')
    @UseGuards(JwtAuthGuard)
    async bulkBook(@Req() req: any, @Body() payload: { parcels: any[] }) {
        const shopId = req.user.shopId;
        const shop = await this.db.shop.findUnique({
            where: { id: shopId },
            select: { redxToken: true },
        });
        if (!shop?.redxToken) throw new BadRequestException('RedX token not set');
        return this.redxService.createBulkParcels(payload.parcels, shop.redxToken);
    }
}
