import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { ShopService } from './shop.service';

@Injectable()
export class ShopCleanupService {
  private readonly logger = new Logger(ShopCleanupService.name);

  constructor(
    private db: DatabaseService,
    private shopService: ShopService,
  ) { }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCleanup() {
    this.logger.log('Starting scheduled shop deletion cleanup...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    try {
      // Find shops scheduled for deletion more than 7 days ago
      const shopsToDelete = await (this.db.shop as any).findMany({
        where: {
          isDeletionScheduled: true,
          deletionScheduledAt: {
            lte: sevenDaysAgo,
          },
        },
        select: { id: true, name: true },
      });

      if (shopsToDelete.length === 0) {
        this.logger.log('No shops found for permanent deletion.');
        return;
      }

      this.logger.log(`Found ${shopsToDelete.length} shops for permanent deletion.`);

      for (const shop of shopsToDelete) {
        try {
          this.logger.log(`Permanently deleting shop: ${shop.name} (${shop.id})`);
          await this.shopService.permanentlyDelete(shop.id);
          this.logger.log(`Successfully deleted shop: ${shop.id}`);
        } catch (error) {
          this.logger.error(`Failed to permanently delete shop ${shop.id}: ${error.message}`);
        }
      }

      this.logger.log('Cleanup finished.');
    } catch (error) {
      this.logger.error(`Error during shop cleanup job: ${error.message}`);
    }
  }
}
