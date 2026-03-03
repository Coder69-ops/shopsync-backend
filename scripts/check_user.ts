
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const email = 'superadmin@shopsync.com';
    const user = await prisma.user.findUnique({
        where: { email },
        include: { shop: true }
    });

    if (!user) {
        console.log(`User ${email} NOT FOUND`);
    } else {
        console.log(`USER DATA:`, {
            id: user.id,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            onboardingCompleted: user.onboardingCompleted,
            shopId: user.shopId
        });
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
