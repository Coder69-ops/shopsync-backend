const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Shop Data Debug ---');
    const shops = await prisma.shop.findMany({
        take: 5
    });

    shops.forEach(shop => {
        console.log(`Shop ID: ${shop.id}`);
        console.log(`Name: ${shop.name}`);
        console.log(`Brand Color: "${shop.brandColor}"`);
        console.log(`Platform IDs: ${JSON.stringify(shop.platformIds)}`);
        console.log('------------------------');
    });

    if (shops.length === 0) {
        console.log('No shops found.');
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
