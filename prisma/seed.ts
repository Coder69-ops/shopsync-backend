import { PrismaClient, OrderStatus, SubscriptionPlan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    // 1. Find or Create a Shop
    let shop = await prisma.shop.findFirst();

    if (!shop) {
        console.log('No shop found. Creating a default shop...');
        shop = await prisma.shop.create({
            data: {
                name: 'Fashion Hub Demo',
                email: 'fashionhub@demo.com', // Added required email
                pageId: '1234567890_DEMO',
                accessToken: 'mock_token',
                plan: SubscriptionPlan.PRO,
                users: {
                    create: {
                        email: 'admin@demo.com',
                        password: 'hashed_password_placeholder', // You'd normally hash this
                        role: 'ADMIN',
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

    // 2. Create Mock Customers
    const customers = [];
    for (let i = 1; i <= 10; i++) {
        const psid = `user_${Math.floor(Math.random() * 1000000)}`;

        // Check if customer exists (to avoid unique constraint errors on re-runs)
        let customer = await prisma.customer.findFirst({
            where: { shopId: shop.id, psid: psid }
        });

        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    shopId: shop.id,
                    psid: psid,
                    name: `Customer ${i}`,
                    email: `customer${i}@example.com`,
                    phone: `0170000000${i}`,
                    tags: i % 3 === 0 ? ['VIP'] : ['NEW'],
                    notes: i % 2 === 0 ? 'Prefers cash on delivery' : null,
                },
            });
        }
        customers.push(customer);
    }
    console.log(`✅ Created/Found ${customers.length} Customers`);

    // 3. Create Mock Orders
    // distribute 50 orders across these customers
    // varied statuses and dates (last 30 days)

    const statuses: OrderStatus[] = [
        OrderStatus.DRAFT,
        OrderStatus.CONFIRMED,
        OrderStatus.CONFIRMED, // Weight confirmed higher
        OrderStatus.SHIPPED,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
        OrderStatus.DELIVERED,
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED
    ];

    let orderCount = 0;

    for (const customer of customers) {
        // 3-7 orders per customer
        const numOrders = Math.floor(Math.random() * 5) + 3;

        for (let j = 0; j < numOrders; j++) {
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const daysAgo = Math.floor(Math.random() * 30);
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);

            await prisma.order.create({
                data: {
                    shopId: shop.id,
                    customerId: customer.id,
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    customerAddress: `House ${Math.floor(Math.random() * 50)}, Road ${Math.floor(Math.random() * 20)}, Dhaka`,
                    items: `${Math.floor(Math.random() * 3) + 1}x Item #${Math.floor(Math.random() * 100)}`,
                    totalPrice: (Math.floor(Math.random() * 50) + 10) * 100, // 1000 - 6000
                    status: status,
                    createdAt: date,
                    trackingId: status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED ? `TRK-${Math.floor(Math.random() * 9000) + 1000}` : null,
                    courierName: status === OrderStatus.SHIPPED || status === OrderStatus.DELIVERED ? 'Steadfast' : null,
                },
            });
            orderCount++;
        }
    }

    console.log(`✅ Created ${orderCount} Orders for ${customers.length} customers.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
