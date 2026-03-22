import { Controller, Post, Body, UseGuards, Get, Patch, Param } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AFFILIATE)
  @Post('payout/request')
  async requestPayout(
      @CurrentUser() user: User, 
      @Body() body: { amount: number; paymentMethod: string }
  ) {
    return this.affiliateService.requestPayout(user.id, body.amount, body.paymentMethod);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AFFILIATE)
  @Get('dashboard')
  async getDashboard(@CurrentUser() user: User) {
      return this.affiliateService.getDashboardStats(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/payouts')
  async getAllPayouts() {
    return this.affiliateService.getAllPayouts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('admin/payouts/:id')
  async updatePayoutStatus(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string }
  ) {
    return this.affiliateService.updatePayoutStatus(id, body.status, body.rejectionReason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/list')
  async getAllAffiliates() {
    return this.affiliateService.getAllAffiliates();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/create')
  async createAffiliate(@Body() body: any) {
    // In production, implement a strict DTO validation instead of 'any'
    return this.affiliateService.createAffiliate(body);
  }
}
