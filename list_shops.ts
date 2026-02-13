import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const shops = await prisma.shop.findMany();
    console.log(JSON.stringify(shops, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
