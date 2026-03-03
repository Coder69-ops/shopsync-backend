import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Get('config')
  async getConfig() {
    return this.paymentService.getPaymentConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Post('submit')
  async submitPayment(
    @CurrentUser() user: User,
    @Body()
    body: {
      amount: number;
      method: string;
      senderNumber: string;
      transactionId: string;
    },
  ) {
    if (!user.shopId) throw new BadRequestException('User has no shop');
    return this.paymentService.submitPayment(user.shopId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@CurrentUser() user: User) {
    if (!user.shopId) throw new BadRequestException('User has no shop');
    return this.paymentService.getHistory(user.shopId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/all')
  async getAllPayments(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentService.getAllPayments(
      search,
      status,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/:id/approve')
  async approvePayment(@CurrentUser() user: User, @Param('id') id: string) {
    return this.paymentService.approvePayment(id, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/:id/reject')
  async rejectPayment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.rejectPaymentInternal(id, reason, user.id);
  }

  private async rejectPaymentInternal(
    id: string,
    reason: string,
    adminId: string,
  ) {
    return this.paymentService.rejectPayment(id, reason, adminId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('admin/stats')
  async getPlatformStats() {
    return this.paymentService.getPlatformStats();
  }
}
