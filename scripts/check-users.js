const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
    const users = await prisma.user.findMany({
        include: { shop: true }
    });
    console.log('Users and their ShopIDs:');
    users.forEach(u => {
        console.log(`- Email: ${u.email}, ShopID: ${u.shopId}, Shop Name: ${u.shop?.name}`);
    });

    await prisma.$disconnect();
}

checkUser();
