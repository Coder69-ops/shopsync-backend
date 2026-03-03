import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('marketing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('campaign')
  @Roles(UserRole.ADMIN)
  async createCampaign(@Body() data: any, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.marketingService.createCampaign(shopId, data);
  }

  @Post('campaign/:id/send')
  @Roles(UserRole.ADMIN)
  async sendCampaign(@Param('id') id: string, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.marketingService.sendCampaign(id, shopId);
  }

  @Get('campaigns')
  @Roles(UserRole.ADMIN)
  async getCampaigns(@Req() req: any) {
    const shopId = req.user.shopId;
    return this.marketingService.getCampaigns(shopId);
  }
}
