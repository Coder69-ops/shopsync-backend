import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { Logger } from '@nestjs/common';

async function teardown() {
    const logger = new Logger('TeardownLoadTest');
    logger.log('🧹 Starting ShopSync Load Test Teardown');

    const app = await NestFactory.createApplicationContext(AppModule);
    const db = app.get(DatabaseService);

    try {
        // 1. Find all mock shops
        const mockShops = await db.shop.findMany({
            where: {
                email: {
                    endsWith: '@loadtest.com'
                }
            },
            select: { id: true }
        });

        const shopIds = mockShops.map(s => s.id);

        if (shopIds.length > 0) {
            logger.log(`Found ${shopIds.length} mock shops. Preparing to delete associated data...`);

            // 2. Safely delete hierarchically due to strict foreign keys

            // Delete Messages (linked to conversations in mock shops)
            const deleteMessages = await db.message.deleteMany({
                where: {
                    conversation: {
                        shopId: { in: shopIds }
                    }
                }
            });
            logger.log(`✅ Deleted ${deleteMessages.count} mock Messages`);

            // Delete Conversations
            const deleteConversations = await db.conversation.deleteMany({
                where: {
                    shopId: { in: shopIds }
                }
            });
            logger.log(`✅ Deleted ${deleteConversations.count} mock Conversations`);

            // Delete Customers
            const deleteCustomers = await db.customer.deleteMany({
                where: {
                    shopId: { in: shopIds }
                }
            });
            logger.log(`✅ Deleted ${deleteCustomers.count} mock Customers`);

            // Delete UsageLogs and TokenUsages
            const deleteUsageLogs = await db.usageLog.deleteMany({
                where: { shopId: { in: shopIds } }
            });
            logger.log(`✅ Deleted ${deleteUsageLogs.count} mock UsageLogs`);

            const deleteTokenUsages = await db.tokenUsage.deleteMany({
                where: { shopId: { in: shopIds } }
            });
            logger.log(`✅ Deleted ${deleteTokenUsages.count} mock TokenUsages`);

            // Delete the Mock Shops
            const deleteShops = await db.shop.deleteMany({
                where: {
                    id: { in: shopIds }
                }
            });
            logger.log(`✅ Deleted ${deleteShops.count} mock Shops`);
        } else {
            logger.log('✅ No mock shops found.');
        }

        // 3. Delete the dummy user
        const deleteUser = await db.user.deleteMany({
            where: {
                email: 'loadtest@shopsync.test'
            }
        });
        logger.log(`✅ Deleted ${deleteUser.count} mock Users`);

        logger.log('🎉 Teardown complete. Your production database is clean.');
    } catch (error) {
        logger.error('❌ Error during teardown', error);
    } finally {
        await app.close();
        process.exit(0);
    }
}

teardown();
