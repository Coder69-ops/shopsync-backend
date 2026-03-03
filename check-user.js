const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { facebookId: '2424013088049478' },
                { email: 'shakhshakib2002@gmail.com' }
            ]
        },
        include: { shop: true }
    });
    console.log(JSON.stringify(user, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
