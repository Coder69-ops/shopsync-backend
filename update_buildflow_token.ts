import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const newToken = 'EAAvPfPqZAiEEBQkk5O7QQfMrohfqGheds5IfvQ3yaB727ICD54EQmu4d0ZCRsQYcLVmY2QnWszY1dOEiYZC6qJu74jWC23nhUKFgv5GP6Kv0PxVd1kh4ZBT7RzyuzGzfNQbre8UamgBfmaAAihj7iygHKrAF3fHjlEcWZBe6HskITtfqJ9pZAoVk6Gapi9WZB6jUNmcC2jSaAZDZD';

async function main() {
    const shop = await prisma.shop.findFirst({
        where: { pageId: '712736731918802' } // BuildFlow Page ID
    });

    if (shop) {
        await prisma.shop.update({
            where: { id: shop.id },
            data: { accessToken: newToken }
        });
        console.log(`✅ Updated access token for shop: ${shop.name} (Page ID: ${shop.pageId})`);
    } else {
        console.log('❌ Shop with Page ID 712736731918802 not found.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
