import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const shopCount = await prisma.shop.count();
    const orderCount = await prisma.order.count();
    const orders = await prisma.order.findMany({ select: { id: true, shopId: true, customerName: true } });

    console.log('--- DB Audit ---');
    console.log(`Shops: ${shopCount}`);
    console.log(`Total Orders: ${orderCount}`);
    console.log('Orders Detail:', JSON.stringify(orders, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
