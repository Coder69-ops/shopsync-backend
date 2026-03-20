import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

const PLAN_CONFIGS = [
  {
    plan: 'FREE' as const,
    monthlyPrice: 0,
    messageLimit: 50,
    orderLimit: 20,
    canUseVoiceAI: false,
    canUseCourier: false,
    removeWatermark: false,
  },
  {
    plan: 'BASIC' as const,
    monthlyPrice: 990,
    messageLimit: 1000,
    orderLimit: 500,
    canUseVoiceAI: false,
    canUseCourier: false,
    removeWatermark: false,
  },
  {
    plan: 'PRO' as const,
    monthlyPrice: 2490,
    messageLimit: -1,
    orderLimit: -1,
    canUseVoiceAI: true,
    canUseCourier: true,
    removeWatermark: true,
  },
  {
    plan: 'PRO_TRIAL' as const,
    monthlyPrice: 0,
    messageLimit: -1,
    orderLimit: -1,
    canUseVoiceAI: true,
    canUseCourier: true,
    removeWatermark: true,
  },
];

@Injectable()
export class AppService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly db: DatabaseService) { }

  async onApplicationBootstrap() {
    await this.seedPlanConfigs();
  }

  private async seedPlanConfigs() {
    try {
      for (const config of PLAN_CONFIGS) {
        await this.db.planConfig.upsert({
          where: { plan: config.plan as any },
          update: config,
          create: config,
        });
      }
      this.logger.log('PlanConfig upserted successfully on startup');
    } catch (err) {
      this.logger.error('Failed to seed PlanConfig on startup', err);
    }
  }

  getHello() {
    return {
      name: 'ShopSync AI API',
      status: 'online',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      message: 'Welcome to the ShopSync backend infrastructure. All systems operational.',
    };
  }

  getSystemMetrics() {
    return {
      name: 'ShopSync AI API',
      version: '1.1.0',
      status: 'up',
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
