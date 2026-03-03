import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Broadcast } from '@prisma/client';

@Injectable()
export class BroadcastService {
  constructor(private db: DatabaseService) {}

  async createBroadcast(data: {
    title: string;
    message: string;
    type: string;
    targetPlan?: string;
    expiresAt?: Date;
  }) {
    return this.db.broadcast.create({
      data: {
        ...data,
        isActive: true,
      },
    });
  }

  async getActiveBroadcasts() {
    const now = new Date();
    const [broadcasts, config] = await Promise.all([
      this.db.broadcast.findMany({
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.systemConfig.findUnique({ where: { id: 'global_config' } }),
    ]);

    // Inject global config message as a high-priority system alert if it exists
    if (config?.broadcastMessage) {
      broadcasts.unshift({
        id: 'system_global_config',
        title: '📌 System Announcement',
        message: config.broadcastMessage,
        type: 'GLOBAL_ALERT',
        isActive: true,
        targetPlan: null,
        expiresAt: null,
        createdAt: config.updatedAt,
        updatedAt: config.updatedAt,
      } as any);
    }

    return broadcasts;
  }

  async getAllBroadcasts() {
    return this.db.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleActive(id: string, isActive: boolean) {
    return this.db.broadcast.update({
      where: { id },
      data: { isActive },
    });
  }

  async deleteBroadcast(id: string) {
    return this.db.broadcast.delete({
      where: { id },
    });
  }
}
