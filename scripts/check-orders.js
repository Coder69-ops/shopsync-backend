const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const shopCount = await prisma.shop.count();
        const orderCount = await prisma.order.count();
        const orders = await prisma.order.findMany({
            select: { id: true, shopId: true, customerName: true, status: true },
            take: 20
        });

        console.log('--- DB Audit ---');
        console.log(`Shops: ${shopCount}`);
        console.log(`Total Orders: ${orderCount}`);
        console.log('Sample Orders:', JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
