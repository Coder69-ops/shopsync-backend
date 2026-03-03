import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const newToken = 'EAAvPfPqZAiEEBQsyilv3TUhS8jiP8JtWUMInzRXwAeLnM63IbjYLSbnhQZC7y4vsghjGlsAoFbAf9FXv4i8QfYiS3OAeOprJSVldO4CuotZAeNSfl07ZBz972mVZAmaXcZCER2ZCxhDTXCqJD7ZAAaqKDRZAIDz7S7E2421Q1CKfS1ywCBGG5PN5tcqX5oBBbYcaAz0huzBgzPgZDZD';

async function main() {
    const shop = await prisma.shop.findFirst();

    if (shop) {
        await prisma.shop.update({
            where: { id: shop.id },
            data: { accessToken: newToken }
        });
        console.log(`✅ Updated access token for shop: ${shop.name}`);
    } else {
        console.log('❌ Shop not found');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
