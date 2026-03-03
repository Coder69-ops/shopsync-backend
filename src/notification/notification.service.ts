import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: {
    userId: string;
    title: string;
    body: string;
    type: string;
    link?: string;
  }) {
    return this.db.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type,
        link: data.link,
      },
    });
  }

  async listByUser(userId: string) {
    return this.db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20, // Limit to recent 20
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.db.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.db.notification.count({
      where: { userId, isRead: false },
    });
  }
}
