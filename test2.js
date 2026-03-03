const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log("All Shops:");
    const shops = await prisma.shop.findMany({ select: { id: true, name: true, platformIds: true, accessToken: true } });
    console.log(JSON.stringify(shops, null, 2));
}

main().finally(() => prisma.$disconnect());
