import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../email/email.service';
import { SystemConfigService } from '../superadmin/system-config.service';
import { addDays, differenceInDays, isBefore, startOfDay } from 'date-fns';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private db: DatabaseService,
        private emailService: EmailService,
        private systemConfig: SystemConfigService,
    ) { }

    /**
     * Daily job at 9:00 AM to check for expiring trials
     */
    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async handleTrialExpirations() {
        this.logger.log('Running daily trial expiration check...');

        const config = await this.systemConfig.getConfig();
        const trialDays = config.trialDays || 14;

        const shops = await this.db.shop.findMany({
            where: {
                plan: 'PRO_TRIAL',
                isActive: true,
            },
        });

        const now = startOfDay(new Date());

        for (const shop of shops) {
            let trialEndsAt = shop.trialEndsAt;

            // Initialize trialEndsAt if missing
            if (!trialEndsAt) {
                trialEndsAt = addDays(shop.createdAt, trialDays);
                await this.db.shop.update({
                    where: { id: shop.id },
                    data: { trialEndsAt },
                });
            }

            const endsAtDate = startOfDay(trialEndsAt);
            const daysLeft = differenceInDays(endsAtDate, now);

            try {
                if (daysLeft === 3) {
                    this.logger.log(`Sending 3-day trial reminder to ${shop.email}`);
                    await this.emailService.sendTrialExpiryReminder(shop.email, 3);
                } else if (daysLeft === 1) {
                    this.logger.log(`Sending 1-day trial reminder to ${shop.email}`);
                    await this.emailService.sendTrialExpiryReminder(shop.email, 1);
                } else if (daysLeft <= 0) {
                    this.logger.log(`Trial expired for shop ${shop.id}. Moving to FREE plan.`);

                    await this.db.shop.update({
                        where: { id: shop.id },
                        data: {
                            plan: 'FREE',
                            // We might want to keep trialEndsAt for history or reset it
                        },
                    });

                    await this.emailService.sendTrialExpired(shop.email);

                    // Also create an in-app notification
                    await this.db.notification.create({
                        data: {
                            userId: (await this.getAdminUserId(shop.id)) || '',
                            title: 'Trial Expired 🔒',
                            body: 'Your Pro Trial has expired. Your account has been downgraded to the Free plan.',
                            type: 'TRIAL_EXPIRED',
                            link: '/billing',
                        },
                    });
                }
            } catch (error) {
                this.logger.error(`Error processing trial for shop ${shop.id}:`, error);
            }
        }
    }

    private async getAdminUserId(shopId: string): Promise<string | null> {
        const user = await this.db.user.findFirst({
            where: { shopId, role: 'ADMIN' },
        });
        return user?.id || null;
    }
}
