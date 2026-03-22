import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding payout methods...');
    
    const methods = [
        { name: 'bKash', type: 'MOBILE', icon: 'Smartphone' },
        { name: 'Nagad', type: 'MOBILE', icon: 'Wallet' },
        { name: 'Rocket', type: 'MOBILE', icon: 'Zap' },
        { name: 'Bank Transfer', type: 'BANK', icon: 'Building2' },
    ];

    for (const method of methods) {
        await (prisma as any).payoutMethod.upsert({
            where: { name: method.name },
            update: {},
            create: {
                name: method.name,
                type: method.type,
                icon: method.icon,
                isActive: true
            }
        });
    }

    console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
