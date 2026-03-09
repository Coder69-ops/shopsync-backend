import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AiAnalyticsSchedulerService implements OnModuleInit {
    private readonly logger = new Logger(AiAnalyticsSchedulerService.name);

    constructor(
        @InjectQueue('ai-analytics-queue') private readonly analyticsQueue: Queue,
        private readonly db: DatabaseService,
    ) { }

    async onModuleInit() {
        this.logger.log('AI Analytics Scheduler Service initialized.');
        // Optional: Run a sanity check or immediate trigger for debugging if needed
    }

    // Run every day at Midnight (12:00 AM)
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleDailyAnalytics() {
        this.logger.log('Triggering daily batch AI analytics for all active shops...');

        try {
            const activeShops = await this.db.shop.findMany({
                where: { isActive: true },
                select: { id: true, name: true }
            });

            this.logger.log(`Found ${activeShops.length} active shops to analyze.`);

            for (const shop of activeShops) {
                await this.analyticsQueue.add('analyze-shop-daily', {
                    shopId: shop.id,
                }, {
                    jobId: `analysis-${shop.id}-${new Date().toISOString().split('T')[0]}`,
                    removeOnComplete: true,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                });
            }

            this.logger.log('All daily analytics jobs have been queued.');
        } catch (error) {
            this.logger.error('Failed to trigger daily AI analytics', error.stack);
        }
    }

    /**
     * Manual trigger for a specific shop (useful for testing or on-demand)
     */
    async triggerManualAnalysis(shopId: string, days: number = 1) {
        this.logger.log(`Manually triggering ${days}-day AI analysis for shop ${shopId}`);
        await this.analyticsQueue.add('analyze-shop-manual', {
            shopId,
            days,
        });
    }
}
