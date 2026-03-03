import { Controller, Get, Patch, Param, UseGuards, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '@prisma/client';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  async getNotifications(@CurrentUser() user: User) {
    return this.notificationService.listByUser(user.id);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, user.id);
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() user: User) {
    return this.notificationService.markAllAsRead(user.id);
  }
}
