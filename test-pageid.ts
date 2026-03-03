import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const shops = await prisma.shop.findMany({ select: { name: true, platformIds: true, id: true } });
    console.log(JSON.stringify(shops, null, 2));

    const specificShop = await prisma.shop.findFirst({
        where: {
            platformIds: {
                path: ['facebook'],
                equals: "926027557270285",
            }
        }
    });

    console.log("Found specific shop?", specificShop ? 'YES' : 'NO');
}
main().finally(() => prisma.$disconnect());
