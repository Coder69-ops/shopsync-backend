import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
  BadRequestException,
  Put,
  Delete,
} from '@nestjs/common';

import { SuperAdminService } from './superadmin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { HealthService } from './health.service';
import { SystemConfigService } from './system-config.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly authService: AuthService,
    private readonly healthService: HealthService,
    private readonly systemConfigService: SystemConfigService,
  ) { }

  @Get('config')
  async getConfig() {
    return this.systemConfigService.getConfig();
  }

  @Patch('config')
  async updateConfig(@CurrentUser() user: User, @Body() data: any) {
    return this.systemConfigService.updateConfig(data, user.id);
  }

  @Post('config/test-ai')
  async testAiConnection(@Body() body: { provider: string; model: string; apiKey?: string }) {
    return this.systemConfigService.testAiConnection(body.provider, body.model, body.apiKey);
  }

  @Post('generate-email-templates')
  async generateEmailTemplates(@Body('prompt') prompt: string) {
    if (!prompt) {
      throw new BadRequestException('Prompt is required');
    }
    return this.superAdminService.generateEmailTemplates(prompt);
  }

  @Get('shops')
  async getAllShops(@Query('search') search: string) {
    return this.superAdminService.getAllShops(search);
  }

  @Get('shops/:id')
  async getShopDetails(@Param('id') id: string) {
    return this.superAdminService.getShopDetails(id);
  }

  @Patch('shops/:id/overrides')
  async updateShopOverrides(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.superAdminService.updateShopOverrides(id, data, admin.id);
  }

  @Post('users/:userId/impersonate')
  async impersonateUser(
    @CurrentUser() admin: User,
    @Param('userId') userId: string,
  ) {
    await this.superAdminService.logAction(admin.id, 'IMPERSONATE', userId, {
      adminEmail: admin.email,
    });
    return this.authService.impersonate(userId);
  }

  @Patch('shops/:shopId/plan')
  async updateShopPlan(
    @CurrentUser() user: User,
    @Param('shopId') shopId: string,
    @Body('plan') plan: string,
    @Body('expiryDate') expiryDate: string,
    @Body('reason') reason: string,
  ) {
    return this.superAdminService.updateShopPlan(
      shopId,
      plan,
      expiryDate ? new Date(expiryDate) : undefined,
      reason,
      user.id,
    );
  }

  @Get('plans')
  async getAllPlans() {
    return this.superAdminService.getAllPlans();
  }

  @Put('plans/:id')
  async updatePlanConfig(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.superAdminService.updatePlanConfig(id, data, admin.id);
  }

  @Post('plans')
  async createPlanConfig(@CurrentUser() admin: User, @Body() data: any) {
    return this.superAdminService.createPlanConfig(data, admin.id);
  }

  @Delete('plans/:id')
  async deletePlanConfig(
    @CurrentUser() admin: User,
    @Param('id') id: string,
  ) {
    return this.superAdminService.deletePlanConfig(id, admin.id);
  }

  @Patch('shops/:shopId/suspend')
  async suspendShop(
    @CurrentUser() user: User,
    @Param('shopId') shopId: string,
  ) {
    return this.superAdminService.toggleShopSuspension(shopId, user.id);
  }

  @Get('health')
  async getHealth() {
    return this.healthService.getSystemStatus();
  }

  @Post('queue/clear')
  async clearQueue(@CurrentUser() admin: User) {
    await this.superAdminService.logAction(
      admin.id,
      'CLEAR_QUEUE',
      'chat-queue',
      {
        reason: 'Manual clear from dashboard',
      },
    );
    return this.healthService.clearFailedJobs();
  }

  @Post('queue/restart')
  async restartQueue(@CurrentUser() admin: User) {
    await this.superAdminService.logAction(
      admin.id,
      'RESTART_QUEUE',
      'chat-queue',
      {
        reason: 'Manual restart from dashboard',
      },
    );
    return this.healthService.restartQueue();
  }
}
