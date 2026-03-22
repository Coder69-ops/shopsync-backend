import { Controller, Post, Body, UseGuards, Get, Patch, Param, Delete } from '@nestjs/common';
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
      @Body() body: { amount: number; paymentMethodId: string; payoutDetails: string }
  ) {
    return this.affiliateService.requestPayout(user.id, body.amount, body.paymentMethodId, body.payoutDetails);
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

  // Expansion Endpoints

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AFFILIATE)
  @Get('profile')
  async getProfile(@CurrentUser() user: User) {
      return this.affiliateService.getAffiliateProfile(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AFFILIATE)
  @Patch('profile/payout-details')
  async updatePayoutDetails(@CurrentUser() user: User, @Body() body: any) {
      return this.affiliateService.updatePayoutDetails(user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.AFFILIATE)
  @Get('payout-methods')
  async getActivePayoutMethods() {
      return this.affiliateService.getPayoutMethods(true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/payout-methods')
  async getAllPayoutMethods() {
      return this.affiliateService.getPayoutMethods(false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/payout-methods')
  async createPayoutMethod(@Body() body: any) {
      return this.affiliateService.createPayoutMethod(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('admin/payout-methods/:id')
  async updatePayoutMethod(@Param('id') id: string, @Body() body: any) {
      return this.affiliateService.updatePayoutMethod(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('admin/payout-methods/:id')
  async deletePayoutMethod(@Param('id') id: string) {
      return this.affiliateService.deletePayoutMethod(id);
  }
}
