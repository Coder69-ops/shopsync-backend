import {
  PrismaClient,
  ProductType,
  SubscriptionPlan,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
const csv = require('csv-parser');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting ShopSync Official Shop Seeding...');

  const hashedPassword = await bcrypt.hash('shopsync2026', 10);

  // 1. Create or Find ShopSync Official Shop
  const shopName = 'ShopSync Official';
  let shop = await prisma.shop.findFirst({
    where: { name: shopName },
  });

  if (!shop) {
    console.log('Creating official ShopSync shop...');
    shop = await prisma.shop.create({
      data: {
        name: shopName,
        email: 'hello@shopsync.it.com',
        plan: SubscriptionPlan.PRO,
        users: {
          create: {
            email: 'admin@shopsync.it.com',
            password: hashedPassword,
            role: UserRole.ADMIN,
            onboardingCompleted: true,
          },
        },
        aiConfig: {
          tone: 'Professional & Helpful',
          useEmojis: true,
          greeting:
            'Welcome to ShopSync! I am your AI assistant. How can I help you automate your business today?',
          outOfStockMessage:
            'This service is currently reaching capacity. Please check back soon!',
        },
      },
    });
  }

  console.log(`✅ Shop Ready: ${shop.name} (${shop.id})`);

  // 2. Import Digital Products from CSV
  const csvPath = fs.existsSync(
    path.resolve(process.cwd(), 'shopsync_digital_products.csv'),
  )
    ? path.resolve(process.cwd(), 'shopsync_digital_products.csv')
    : path.resolve(process.cwd(), '..', 'shopsync_digital_products.csv');
  if (fs.existsSync(csvPath)) {
    console.log('Importing digital products from:', csvPath);
    const products: any[] = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data: any) => products.push(data))
        .on('end', () => resolve(null))
        .on('error', (err: any) => reject(err));
    });

    for (const record of products) {
      try {
        await prisma.product.upsert({
          where: {
            shopId_sku: {
              shopId: shop.id,
              sku: record.sku,
            },
          },
          update: {
            name: record.name,
            price: parseFloat(record.price),
            stock: parseInt(record.stock),
            description: record.description,
            category: record.category,
            imageUrl: record.imageUrl,
            unit: record.unit,
            type: record.type as ProductType,
            attributes: record.attributes ? JSON.parse(record.attributes) : {},
          },
          create: {
            shopId: shop.id,
            name: record.name,
            sku: record.sku,
            price: parseFloat(record.price),
            stock: parseInt(record.stock),
            description: record.description,
            category: record.category,
            imageUrl: record.imageUrl,
            unit: record.unit,
            type: record.type as ProductType,
            attributes: record.attributes ? JSON.parse(record.attributes) : {},
          },
        });
        console.log(`  - Synchronized product: ${record.sku}`);
      } catch (err) {
        console.error(`  - Failed to seed product ${record.sku}:`, err.message);
      }
    }
    console.log('✅ Digital products processing complete.');
  } else {
    console.warn('⚠️ shopsync_digital_products.csv not found at root.');
  }

  // 3. Import KnowledgeBase from JSON
  const jsonPath = fs.existsSync(
    path.resolve(process.cwd(), 'shopsync_knowledgebase.json'),
  )
    ? path.resolve(process.cwd(), 'shopsync_knowledgebase.json')
    : path.resolve(process.cwd(), '..', 'shopsync_knowledgebase.json');
  if (fs.existsSync(jsonPath)) {
    console.log('Importing knowledgebase from:', jsonPath);
    const kbData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    for (const entry of kbData) {
      const existing = await prisma.knowledgeBase.findFirst({
        where: {
          shopId: shop.id,
          question: entry.question,
        },
      });

      if (!existing) {
        await prisma.knowledgeBase.create({
          data: {
            shopId: shop.id,
            question: entry.question,
            answer: entry.answer,
          },
        });
        console.log(`  - Added KB: ${entry.question.substring(0, 30)}...`);
      }
    }
    console.log('✅ Knowledgebase entries synchronized.');
  } else {
    console.warn('⚠️ shopsync_knowledgebase.json not found at root.');
  }

  console.log('✨ ShopSync Seeding Completed Successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
