
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding extra shops and payments for testing...');

    // Create 3 more shops
    for (let i = 1; i <= 3; i++) {
        const shopEmail = `testshop${i}@example.com`;
        const existing = await prisma.shop.findUnique({ where: { email: shopEmail } });

        if (!existing) {
            const shop = await prisma.shop.create({
                data: {
                    name: `Test Shop ${i}`,
                    email: shopEmail,
                    plan: i === 1 ? 'PRO' : 'BASIC',
                    isActive: i !== 3, // shop 3 is suspended
                    users: {
                        create: {
                            email: `owner${i}@test.com`,
                            password: 'hashed_password', // Mock
                            role: 'ADMIN'
                        }
                    }
                }
            });

            // Add a payment for this shop
            await prisma.payment.create({
                data: {
                    shopId: shop.id,
                    amount: 3000,
                    method: 'bKash',
                    senderNumber: '01700000000',
                    transactionId: `TRX${Math.random().toString(36).substring(7).toUpperCase()}`,
                    status: i === 1 ? 'APPROVED' : 'PENDING'
                }
            });
            console.log(`Created shop ${shop.name} with a payment.`);
        }
    }

    console.log('✅ Seed extra completed.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
