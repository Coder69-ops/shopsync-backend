import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const pageId = '926027557270285';

    // See all shops and their platformIds
    const allShops = await prisma.shop.findMany({ select: { name: true, platformIds: true, id: true } });
    console.log("ALL SHOPS:", JSON.stringify(allShops, null, 2));

    // Test the exact query WebhookService uses
    const specificShop = await prisma.shop.findFirst({
        where: {
            platformIds: {
                path: ['facebook'],
                equals: pageId,
            }
        }
    });

    console.log("webhook query found shop:", specificShop?.id || "NO SHOP FOUND");
}

main().finally(() => prisma.$disconnect());
