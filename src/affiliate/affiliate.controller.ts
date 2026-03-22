import { Controller, Post, Body, UseGuards, Get, Patch, Param, Delete, Req, Res } from '@nestjs/common';
import { AffiliateService } from './affiliate.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApplyAffiliateDto } from './dto/apply-affiliate.dto';

@Controller('affiliate')
export class AffiliateController {
  constructor(private readonly affiliateService: AffiliateService) {}

  @Post('apply')
  async apply(@Body() dto: ApplyAffiliateDto) {
    return this.affiliateService.submitApplication(dto);
  }

  @Get('track/:code')
  async trackClick(
    @Param('code') code: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    await this.affiliateService.trackClick(code, ip, userAgent);
    
    // Redirect to landing page with the promo code in query if needed, 
    // or just to the home page.
    return res.redirect(`/?ref=${code}`);
  }

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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/applications')
  async getApplications() {
    return this.affiliateService.getApplications();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('admin/applications/:id')
  async updateApplicationStatus(
    @Param('id') id: string,
    @Body() body: { status: any; rejectionReason?: string }
  ) {
    return this.affiliateService.updateApplicationStatus(id, body.status, body.rejectionReason);
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
  @Get('admin/affiliate/:id')
  async getAffiliateDetailsAdmin(@Param('id') id: string) {
    return this.affiliateService.getAffiliateDetailsAdmin(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/affiliate/:id/status')
  async updateAffiliateStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean }
  ) {
    return this.affiliateService.updateAffiliateStatus(id, body.isActive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('admin/affiliate/:id/promo/:codeId')
  async revokePromoCode(
    @Param('id') id: string,
    @Param('codeId') codeId: string
  ) {
    return this.affiliateService.revokePromoCode(id, codeId);
  }
}
