
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const shopCount = await prisma.shop.count();
    const paymentCount = await prisma.payment.count();
    const shops = await prisma.shop.findMany({ take: 5, select: { id: true, name: true, email: true } });
    const payments = await prisma.payment.findMany({ take: 5 });

    console.log('--- DATABASE CHECK ---');
    console.log('Shops Count:', shopCount);
    console.log('Payments Count:', paymentCount);
    console.log('Sample Shops:', JSON.stringify(shops, null, 2));
    console.log('Sample Payments:', JSON.stringify(payments, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
