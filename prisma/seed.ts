import { PrismaClient, OrderStatus, SubscriptionPlan, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    const hashedPassword = await bcrypt.hash('admin123', 10);

    // 1. Create SuperAdmin if not exists
    const superadminEmail = 'superadmin@shopsync.it.com';
    const existingSuperadmin = await prisma.user.findUnique({
        where: { email: superadminEmail }
    });

    if (!existingSuperadmin) {
        console.log('Creating SuperAdmin...');
        await prisma.user.create({
            data: {
                email: superadminEmail,
                password: hashedPassword,
                role: UserRole.SUPERADMIN,
                isActive: true,
                onboardingCompleted: true,
            }
        });
        console.log('✅ SuperAdmin created: superadmin@shopsync.it.com / admin123');
    } else {
        console.log('ℹ️ SuperAdmin already exists.');
    }

    // 1.5 Create PlanConfigs
    console.log('Synchronizing PlanConfigs...');
    const planConfigs = [
        { plan: SubscriptionPlan.FREE, monthlyPrice: 0, messageLimit: 100, orderLimit: 10, canUseVoiceAI: false, canUseCourier: false, removeWatermark: false },
        { plan: SubscriptionPlan.BASIC, monthlyPrice: 1500, messageLimit: 1000, orderLimit: 100, canUseVoiceAI: false, canUseCourier: false, removeWatermark: false },
        { plan: SubscriptionPlan.PRO, monthlyPrice: 3000, messageLimit: -1, orderLimit: -1, canUseVoiceAI: true, canUseCourier: true, removeWatermark: true },
    ];

    for (const config of planConfigs) {
        await prisma.planConfig.upsert({
            where: { plan: config.plan },
            update: {},
            create: config
        });
    }
    console.log('✅ PlanConfigs synchronized.');


    // 2. Find or Create a Shop
    let shop = await prisma.shop.findFirst();

    if (!shop) {
        console.log('No shop found. Creating a default shop...');
        shop = await prisma.shop.create({
            data: {
                name: 'Fashion Hub Demo',
                email: 'fashionhub@demo.com',
                platformIds: { facebook: '1234567890_DEMO' },
                accessToken: 'mock_token',
                plan: SubscriptionPlan.PRO,
                users: {
                    create: {
                        email: 'admin@demo.com',
                        password: hashedPassword,
                        role: UserRole.ADMIN,
                        onboardingCompleted: true,
                    }
                },
                aiConfig: {
                    tone: 'Friendly',
                    useEmojis: true,
                    greeting: 'Welcome to Fashion Hub! How can I help you today?',
                    outOfStockMessage: 'Oh no! That item is currently out of stock.'
                }
            },
        });
    }

    console.log(`Using Shop: ${shop.name} (${shop.id})`);

    // 3. Create Mock Customers
    const customers = [];
    const customerCount = 5; // Reduced for speed
    for (let i = 1; i <= customerCount; i++) {
        const psid = `user_demo_${i}`;

        let customer = await prisma.customer.findFirst({
            where: { shopId: shop.id, externalId: psid }
        });

        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    shopId: shop.id,
                    externalId: psid,
                    platform: 'FACEBOOK',
                    name: `Customer ${i}`,
                    email: `customer${i}@example.com`,
                    phone: `0170000000${i}`,
                    tags: i % 3 === 0 ? ['VIP'] : ['NEW'],
                },
            });
        }
        customers.push(customer);
    }
    console.log(`✅ Created/Found ${customers.length} Customers`);

    // 4. Create Mock Orders
    const statuses: OrderStatus[] = [
        OrderStatus.DRAFT,
        OrderStatus.CONFIRMED,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    ];

    let orderCount = 0;
    for (const customer of customers) {
        const existingOrder = await prisma.order.findFirst({ where: { customerId: customer.id } });
        if (existingOrder) continue;

        const numOrders = 2;
        for (let j = 0; j < numOrders; j++) {
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 10));

            await prisma.order.create({
                data: {
                    shopId: shop.id,
                    customerId: customer.id,
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    customerAddress: 'Dhaka, Bangladesh',
                    orderItems: {
                        create: [
                            {
                                name: 'Demo Product',
                                quantity: 1,
                                unitPrice: 1500,
                                total: 1500,
                            }
                        ]
                    },
                    totalPrice: 1500,
                    status: status,
                    createdAt: date,
                },
            });
            orderCount++;
        }
    }

    console.log(`✅ Created ${orderCount} new Orders.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
