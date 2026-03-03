import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectQueue('chat-queue') private chatQueue: Queue,
    private db: DatabaseService,
  ) {}

  async getSystemStatus() {
    try {
      const [waiting, active, failed, completed] = await Promise.all([
        this.chatQueue.getWaitingCount(),
        this.chatQueue.getActiveCount(),
        this.chatQueue.getFailedCount(),
        this.chatQueue.getCompletedCount(),
      ]);

      // Redis Check (BullMQ uses Redis, so if metrics return, Redis is up)
      const redisStatus = 'UP';

      return {
        redisStatus,
        queues: {
          chatQueue: {
            waiting,
            active,
            failed,
            completed,
          },
        },
      };
    } catch (error) {
      this.logger.error('Failed to get system status', error.stack);
      return {
        redisStatus: 'DOWN',
        error: error.message,
      };
    }
  }

  async clearFailedJobs() {
    this.logger.log('Clearing failed jobs from chat-queue');
    const failedJobs = await this.chatQueue.getFailed();
    await Promise.all(failedJobs.map((job) => job.remove()));
    return { success: true, count: failedJobs.length };
  }

  async restartQueue() {
    this.logger.log('Retrying all failed jobs in chat-queue');
    const failedJobs = await this.chatQueue.getFailed();
    await Promise.all(failedJobs.map((job) => job.retry()));
    return { success: true, count: failedJobs.length };
  }
}
