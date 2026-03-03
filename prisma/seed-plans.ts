import { PrismaClient, SubscriptionPlan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const configs = [
        {
            plan: SubscriptionPlan.FREE,
            monthlyPrice: 0,
            messageLimit: 50,
            orderLimit: 20,
            canUseVoiceAI: false,
            canUseCourier: false,
            removeWatermark: false,
        },
        {
            plan: SubscriptionPlan.BASIC,
            monthlyPrice: 990,
            messageLimit: 1000,
            orderLimit: 500,
            canUseVoiceAI: false,
            canUseCourier: false,
            removeWatermark: false,
        },
        {
            plan: SubscriptionPlan.PRO,
            monthlyPrice: 2490,
            messageLimit: -1,
            orderLimit: -1,
            canUseVoiceAI: true,
            canUseCourier: true,
            removeWatermark: true,
        },
        {
            plan: SubscriptionPlan.PRO_TRIAL,
            monthlyPrice: 0,
            messageLimit: -1,
            orderLimit: -1,
            canUseVoiceAI: true,
            canUseCourier: true,
            removeWatermark: true,
        },
    ];

    for (const config of configs) {
        await prisma.planConfig.upsert({
            where: { plan: config.plan },
            update: config,
            create: config,
        });
    }

    console.log('PlanConfig seeded successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
