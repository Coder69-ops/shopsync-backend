
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const config = await prisma.systemConfig.findUnique({
        where: { id: 'global_config' }
    });

    console.log('--- SYSTEM CONFIG CHECK ---');
    if (!config) {
        console.log('No global_config found in database.');
    } else {
        console.log(JSON.stringify(config, null, 2));
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
