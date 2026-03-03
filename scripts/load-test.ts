import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const NUM_CLIENTS = 100; // Number of mocked shops / pages
const MESSAGES_PER_CLIENT = 10; // How many messages each client sends
const DELAY_BETWEEN_BATCHES_MS = 500; // Delay between queue injection batches

async function bootstrap() {
    const logger = new Logger('LoadTester');
    logger.log('🚀 Starting ShopSync Load Tester');

    // Ensure we are in LOAD_TEST_MODE
    if (process.env.LOAD_TEST_MODE !== 'true') {
        logger.error('❌ YOU MUST RUN THIS WITH LOAD_TEST_MODE=true');
        process.exit(1);
    }

    // 1. Boot up the Nest Application Context (so we have DB and Redis connections)
    // We only initialize the context, not the HTTP server, which is faster.
    const app = await NestFactory.createApplicationContext(AppModule);

    const db = app.get(DatabaseService);

    // We need the BullMQ queue instance to inject jobs
    // Using the underlying Redis connection to grab the queue bypassing DI if easier, 
    // but nestjs BullMQ provides the class if properly exported.
    // We'll construct standard raw queue for chat-queue if DI is tricky in scripts.
    const chatQueue = new Queue('chat-queue', {
        connection: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
        },
    });

    // 2. Setup 100 Mock Shops
    logger.log(`🛠️ Creating or fetching ${NUM_CLIENTS} Mock Shops...`);

    const dummyUser = await db.user.upsert({
        where: { email: 'loadtest@shopsync.test' },
        update: {},
        create: {
            email: 'loadtest@shopsync.test',
            password: 'mock_password_hash',
            onboardingCompleted: true
        }
    });

    const mockShopIds: string[] = [];
    const mockPageIds: string[] = [];

    for (let i = 0; i < NUM_CLIENTS; i++) {
        const fakePageId = `mock_page_${i}_${Date.now()}`;
        const shopName = `Load Test Shop ${i}`;

        // For idempotency in testing
        const shop = await db.shop.upsert({
            where: { email: `shop${i}@loadtest.com` },
            update: {
                name: shopName,
                platformIds: { facebook: fakePageId },
                accessToken: `mock_token_${i}`,
                plan: 'PRO' // Ensure they have AI access
            },
            create: {
                name: shopName,
                email: `shop${i}@loadtest.com`,
                plan: 'PRO',
                accessToken: `mock_token_${i}`,
                platformIds: { facebook: fakePageId },
                aiConfig: { enableChatAi: true },
                users: { connect: { id: dummyUser.id } }
            }
        });

        mockShopIds.push(shop.id);
        mockPageIds.push(fakePageId);
    }

    logger.log(`✅ Loaded ${NUM_CLIENTS} shops.`);

    // 3. Inject Webhook Events into Queue
    logger.log(`🎯 Commencing Load Test: Injecting ${NUM_CLIENTS * MESSAGES_PER_CLIENT} messages...`);

    let totalInjected = 0;

    for (let m = 0; m < MESSAGES_PER_CLIENT; m++) {
        const jobs = [];

        for (let c = 0; c < NUM_CLIENTS; c++) {
            const pageId = mockPageIds[c];
            const customerPsid = `mock_customer_${c}_${m}`;

            const payload = {
                object: 'page',
                entry: [
                    {
                        id: pageId,
                        messaging: [
                            {
                                sender: { id: customerPsid },
                                message: { text: `Hello from mocked user ${customerPsid}!` }
                            }
                        ]
                    }
                ]
            };

            jobs.push({
                name: 'facebook-webhook',
                data: payload,
                opts: {
                    attempts: 1, // Fail fast for load test
                    removeOnComplete: true,
                    removeOnFail: false
                }
            });
        }

        // Add batch to queue
        await chatQueue.addBulk(jobs);
        totalInjected += jobs.length;
        logger.log(`Sent batch ${m + 1}/${MESSAGES_PER_CLIENT} (${jobs.length} messages) -> Total: ${totalInjected}`);

        if (DELAY_BETWEEN_BATCHES_MS > 0) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
        }
    }

    logger.log(`🎉 Load test injection complete. Total injected: ${totalInjected}. Close the script and monitor the Nested worker console.`);
    await app.close();
    await chatQueue.close();
    process.exit(0);
}

bootstrap().catch(err => {
    console.error('Fatal error during load testing', err);
    process.exit(1);
});
