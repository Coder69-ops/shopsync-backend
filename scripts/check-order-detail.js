const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOrder() {
    const orderId = '12fe95f4-140a-4e86-8358-de02bbfbeaea';
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { shop: true }
    });

    if (order) {
        console.log('Order Found:');
        console.log('ID:', order.id);
        console.log('ShopID:', order.shopId);
        console.log('Customer:', order.customerName);
        console.log('Total:', order.totalPrice);
        console.log('Items:', order.items);
    } else {
        console.log('Order NOT found with ID:', orderId);

        // Try fuzzy search or list recent ones
        const recentOrders = await prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' }
        });
        console.log('\nRecent Orders:');
        recentOrders.forEach(o => {
            console.log(`- ID: ${o.id}, ShopID: ${o.shopId}, Customer: ${o.customerName}`);
        });
    }

    await prisma.$disconnect();
}

checkOrder();
