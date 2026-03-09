import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// Use strings instead of enum exports to resolve IDE ghosting while maintaining functionality
const UserRole = {
  ADMIN: 'ADMIN' as any,
  SUPERADMIN: 'SUPERADMIN' as any,
};

const SubscriptionPlan = {
  FREE: 'FREE' as any,
  BASIC: 'BASIC' as any,
  PRO: 'PRO' as any,
};

const prisma = new PrismaClient();

async function main() {
  console.log('--- ShopSync Bootstrap ---');

  // 1. Create Superadmin
  const superEmail = 'admin@shopsync.ai';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const superadmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: superEmail,
      password: hashedPassword,
      role: UserRole.SUPERADMIN,
    },
  });

  console.log(`✅ Superadmin created: ${superadmin.email}`);

  // 2. Create Initial Demo Shop (Optional but helpful for testing)
  // 2. Create Initial Demo Shop (Optional but helpful for testing)
  const demoShopEmail = 'demo@shopsync.ai';
  const demoShop = await prisma.shop.upsert({
    where: { email: demoShopEmail },
    update: {},
    create: {
      id: crypto.randomUUID(),
      name: 'Demo Shop',
      email: demoShopEmail,
      platformIds: { facebook: '123456789' },
      accessToken: 'dummy_access_token',
      plan: SubscriptionPlan.PRO,
    },
  });

  console.log(`✅ Demo Shop created: ${demoShop.name} (${demoShop.id})`);

  // 3. Create Admin for Demo Shop
  const adminEmail = 'owner@demo.com';
  const adminPassword = await bcrypt.hash('owner123', 10);

  const shopAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      id: crypto.randomUUID(),
      email: adminEmail,
      password: adminPassword,
      role: UserRole.ADMIN,
      shopId: demoShop.id,
    },
  });

  console.log(
    `✅ Shop Admin created: ${shopAdmin.email} for shop ${demoShop.name}`,
  );

  console.log('--- Bootstrap Complete ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
