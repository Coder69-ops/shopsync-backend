
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const shopCount = await prisma.shop.count();
    const paymentCount = await prisma.payment.count();
    const usersCount = await prisma.user.count();
    const shops = await prisma.shop.findMany({
        include: { _count: { select: { orders: true, users: true } } }
    });
    const payments = await prisma.payment.findMany({ include: { shop: true } });

    console.log('--- FINAL DATABASE CHECK ---');
    console.log('Shops Count:', shopCount);
    console.log('Payments Count:', paymentCount);
    console.log('Users Count:', usersCount);
    console.log('Shops List:', shops.map(s => ({ name: s.name, active: s.isActive, orders: s._count.orders })));
    console.log('Payments List:', payments.map(p => ({ shop: p.shop.name, amount: p.amount, status: p.status })));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
