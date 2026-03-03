const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const shops = await prisma.shop.findMany({
            select: { id: true, name: true, _count: { select: { orders: true } } }
        });

        const users = await prisma.user.findMany({
            select: { email: true, shopId: true, role: true }
        });

        console.log('--- Shops & Orders ---');
        console.log(JSON.stringify(shops, null, 2));

        console.log('--- Users ---');
        console.log(JSON.stringify(users, null, 2));

    } catch (error) {
        console.error('Audit failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
