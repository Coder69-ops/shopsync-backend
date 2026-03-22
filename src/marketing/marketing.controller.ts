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

  @Post('generate-copy')
  @Roles(UserRole.ADMIN)
  async generateCopy(@Body() data: { prompt: string }, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.marketingService.generateCopy(shopId, data.prompt);
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

  @Get('campaign/:id')
  @Roles(UserRole.ADMIN)
  async getCampaign(@Param('id') id: string, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.marketingService.getCampaign(id, shopId);
  }
}
