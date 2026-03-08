import pkg from '@prisma/client';
const { PrismaClient, OrderStatus, SubscriptionPlan, UserRole } = pkg;
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting seed...');

    const hashedPassword = await bcrypt.hash('admin123', 10);

    // 1. Create SuperAdmin if not exists
    const superadminEmail = 'superadmin@shopsync.it.com';
    const existingSuperadmin = await prisma.user.findUnique({
        where: { email: superadminEmail }
    });

    if (!existingSuperadmin) {
        console.log('Creating SuperAdmin...');
        await prisma.user.create({
            data: {
                email: superadminEmail,
                password: hashedPassword,
                role: UserRole.SUPERADMIN,
                isActive: true,
                onboardingCompleted: true,
            }
        });
        console.log('✅ SuperAdmin created: superadmin@shopsync.it.com / admin123');
    } else {
        console.log('ℹ️ SuperAdmin already exists.');
    }

    // 1.5 Create PlanConfigs
    console.log('Synchronizing PlanConfigs...');
    const planConfigs = [
        { plan: SubscriptionPlan.FREE, monthlyPrice: 0, messageLimit: 100, orderLimit: 10, canUseVoiceAI: false, canUseCourier: false, removeWatermark: false },
        { plan: SubscriptionPlan.BASIC, monthlyPrice: 1500, messageLimit: 1000, orderLimit: 100, canUseVoiceAI: false, canUseCourier: false, removeWatermark: false },
        { plan: SubscriptionPlan.PRO, monthlyPrice: 3000, messageLimit: -1, orderLimit: -1, canUseVoiceAI: true, canUseCourier: true, removeWatermark: true },
    ];

    for (const config of planConfigs) {
        await prisma.planConfig.upsert({
            where: { plan: config.plan },
            update: {},
            create: config
        });
    }
    console.log('✅ PlanConfigs synchronized.');


    // 2. Find or Create a Shop
    let shop = await prisma.shop.findFirst();

    if (!shop) {
        console.log('No shop found. Creating a default shop...');
        shop = await prisma.shop.create({
            data: {
                name: 'Fashion Hub Demo',
                email: 'fashionhub@demo.com',
                platformIds: { facebook: '1234567890_DEMO' },
                accessToken: 'mock_token',
                plan: SubscriptionPlan.PRO,
                users: {
                    create: {
                        email: 'admin@demo.com',
                        password: hashedPassword,
                        role: UserRole.ADMIN,
                        onboardingCompleted: true,
                    }
                },
                aiConfig: {
                    tone: 'Friendly',
                    useEmojis: true,
                    greeting: 'Welcome to Fashion Hub! How can I help you today?',
                    outOfStockMessage: 'Oh no! That item is currently out of stock.'
                }
            },
        });
    }

    console.log(`Using Shop: ${shop.name} (${shop.id})`);

    // 3. Create Mock Customers
    const customers = [];
    const customerCount = 5; // Reduced for speed
    for (let i = 1; i <= customerCount; i++) {
        const psid = `user_demo_${i}`;

        let customer = await prisma.customer.findFirst({
            where: { shopId: shop.id, externalId: psid }
        });

        if (!customer) {
            customer = await prisma.customer.create({
                data: {
                    shopId: shop.id,
                    externalId: psid,
                    platform: 'FACEBOOK',
                    name: `Customer ${i}`,
                    email: `customer${i}@example.com`,
                    phone: `0170000000${i}`,
                    tags: i % 3 === 0 ? ['VIP'] : ['NEW'],
                },
            });
        }
        customers.push(customer);
    }
    console.log(`✅ Created/Found ${customers.length} Customers`);

    // 4. Create Mock Orders
    const statuses = [
        OrderStatus.DRAFT,
        OrderStatus.CONFIRMED,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    ];

    let orderCount = 0;
    for (const customer of customers) {
        const existingOrder = await prisma.order.findFirst({ where: { customerId: customer.id } });
        if (existingOrder) continue;

        const numOrders = 2;
        for (let j = 0; j < numOrders; j++) {
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 10));

            await prisma.order.create({
                data: {
                    shopId: shop.id,
                    customerId: customer.id,
                    customerName: customer.name,
                    customerPhone: customer.phone,
                    customerAddress: 'Dhaka, Bangladesh',
                    orderItems: {
                        create: [
                            {
                                name: 'Demo Product',
                                quantity: 1,
                                unitPrice: 1500,
                                total: 1500,
                            }
                        ]
                    },
                    totalPrice: 1500,
                    status: status,
                    createdAt: date,
                },
            });
            orderCount++;
        }
    }

    console.log(`✅ Created ${orderCount} new Orders.`);

    // 5. Seed Email Presets
    console.log('🚮 Clearing existing presets...');
    await prisma.emailPreset.deleteMany();

    console.log('🌱 Seeding 12 premium presets...');
    const PRESETS = [
        {
            name: "Modern Sleek",
            description: "Minimalist and clean design with high-contrast typography. Best for fashion or tech.",
            thumbnailUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style type="text/css">
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { margin: 0; padding: 0; min-width: 100%; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; color: #1e293b; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #f8fafc; padding: 40px 0; }
        .main { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; border-spacing: 0; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        .header { padding: 40px; text-align: center; }
        .content { padding: 0 40px 40px; line-height: 1.6; font-size: 16px; }
        .footer { padding: 40px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; }
        .logo { height: 48px; width: auto; }
        .social-link { text-decoration: none; margin: 0 10px; color: #0f172a; }
        .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; }
        @media only screen and (max-width: 600px) {
            .main { border-radius: 0; width: 100% !important; }
            .header, .content, .footer { padding: 30px 20px !important; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <table class="main" width="100%" cellpadding="0" cellspacing="0">
            <tr><td class="header"><img src="#LOGO_URL#" alt="#SHOP_NAME#" class="logo"></td></tr>
            <tr><td class="content">#CONTENT#</td></tr>
            <tr>
                <td class="footer">
                    #SOCIAL_LINKS#
                    <p style="margin: 20px 0;">&copy; #YEAR# #SHOP_NAME#. All rights reserved.</p>
                    <p>#SHOP_ADDRESS#</p>
                    <p style="margin-top: 10px;"><a href="#UNSUBSCRIBE_URL#" style="color: #64748b; text-decoration: underline;">Unsubscribe</a></p>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`,
            welcomeEmailSubject: "Welcome to #SHOP_NAME#! 🥂",
            welcomeEmailBody: `<h1 style="margin-top:0; font-size: 28px; font-weight: 700;">Welcome aboard!</h1><p>We're thrilled to have you here at #SHOP_NAME#. Your journey to premium style starts now.</p><div style="text-align: center; margin-top: 32px;"><a href="#DASHBOARD_URL#" class="btn">Start Shopping</a></div>`,
            newOrderEmailSubject: "Confirmed! Your order ##ID# is here 📦",
            newOrderEmailBody: `<h1 style="margin-top:0;">Order Confirmed!</h1><p>We've received your order ##ID# and our team is already preparing it for you.</p><div style="margin: 32px 0; background: #f8fafc; border-radius: 20px; padding: 24px;">#ITEMS#<table width="100%" style="margin-top: 20px; border-top: 2px solid #e2e8f0; padding-top: 16px;"><tr><td style="font-weight: 800; font-size: 20px; color: #0f172a;">Total</td><td style="text-align: right; font-weight: 800; font-size: 20px; color: #0f172a;">#TOTAL#</td></tr></table></div>`,
            lowStockEmailSubject: "⚠️ Inventory Alert: #PRODUCT#",
            lowStockEmailBody: `<h1 style="color: #e11d48; margin-top:0;">Stock Alert!</h1><p>Your product <strong>#PRODUCT#</strong> is running low on stock. Time to replenish!</p><div style="text-align: center; margin-top: 32px;"><a href="#DASHBOARD_URL#" class="btn" style="background-color: #e11d48;">Restock Now</a></div>`,
            adminAlertEmailSubject: "New Merchant signup: #EMAIL# 🏢",
            adminAlertEmailBody: `<h1 style="margin-top:0;">New Registration</h1><div style="background: #f1f5f9; border-radius: 12px; padding: 20px;"><p style="margin: 0;"><strong>Email:</strong> #EMAIL#</p><p style="margin: 8px 0 0;"><strong>Shop Name:</strong> #SHOP_NAME#</p></div>`,
            verifyEmailSubject: "Verify your ShopSync account",
            verifyEmailBody: `<h1 style="margin-top:0; font-size: 28px; font-weight: 700;">Account Verification</h1><p>Hello #USER_NAME#,<br/><br/>Please verify your account by clicking the button below:</p><div style="text-align: center; margin-top: 32px;"><a href="#VERIFY_LINK#" class="btn">Verify Email</a></div>`,
            forgotPasswordEmailSubject: "Reset your ShopSync password",
            forgotPasswordEmailBody: `<h1 style="margin-top:0; font-size: 28px; font-weight: 700;">Password Reset</h1><p>Hello #USER_NAME#,<br/><br/>We received a request to reset your password. Click the button below to proceed:</p><div style="text-align: center; margin-top: 32px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        },
        {
            name: "Midnight Pro",
            description: "Sophisticated dark theme with vibrant accents.",
            thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { font-family: 'Inter', -apple-system, sans-serif; background-color: #0c0a09; margin: 0; padding: 0; }
                .wrapper { width: 100%; background-color: #0c0a09; padding: 40px 0; }
                .container { max-width: 600px; margin: 0 auto; background: #1c1917; border: 1px solid #292524; border-radius: 24px; overflow: hidden; }
                .header { padding: 48px; text-align: center; border-bottom: 1px solid #292524; }
                .content { padding: 48px; color: #d6d3d1; line-height: 1.8; }
                .footer { padding: 48px; text-align: center; border-top: 1px solid #292524; color: #78716c; font-size: 12px; }
                .btn { display: inline-block; background: #10b981; color: #000000 !important; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
                @media only screen and (max-width: 600px) { .container { border-radius: 0; } .header, .content, .footer { padding: 32px 24px !important; } }
            </style></head><body><div class="wrapper"><div class="container"><div class="header"><img src="#LOGO_URL#" height="48"></div><div class="content">#CONTENT#</div><div class="footer">#SOCIAL_LINKS#<p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "Midnight Welcome from #SHOP_NAME# 🌌",
            welcomeEmailBody: `<h1 style="color: #ffffff; font-size: 32px; letter-spacing: -0.02em;">Welcome to the future.</h1><p>Thank you for choosing #SHOP_NAME#. We are pushing the boundaries of what is possible, and we are glad you are with us.</p><div style="margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn">Explore Now</a></div>`,
            newOrderEmailSubject: "Order Received: ##ID# 💫",
            newOrderEmailBody: `<h1 style="color: #ffffff;">Order Locked In.</h1><p>Your order ##ID# has been processed through our secure nodes.</p><div style="background: #292524; padding: 24px; border-radius: 16px; margin: 32px 0; border: 1px solid #44403c;">#ITEMS#</div>`,
            lowStockEmailSubject: "Critical Stock Warning: #PRODUCT# 🚨",
            lowStockEmailBody: `<h1 style="color: #ef4444;">Flash Inventory Alert</h1><p>Our sensors indicate that <strong>#PRODUCT#</strong> inventory is nearly depleted.</p><div style="margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn" style="background:#ef4444;">Manage Stock</a></div>`,
            adminAlertEmailSubject: "Platform Growth: New Signup #EMAIL# 🚀",
            adminAlertEmailBody: `<h1 style="color: #ffffff;">New Node Added</h1><div style="border-left: 4px solid #10b981; padding-left: 20px; margin: 20px 0;"><p>Entity: #SHOP_NAME#</p><p>Identifier: #EMAIL#</p></div>`,
            verifyEmailSubject: "Verify your identity 🔒",
            verifyEmailBody: `<h1 style="color: #ffffff; font-size: 32px;">Security Verification</h1><p>Confirm your node connection by verifying your email address.</p><div style="margin-top: 40px;"><a href="#VERIFY_LINK#" class="btn">Verify Node</a></div>`,
            forgotPasswordEmailSubject: "Password Reset Protocol 🔐",
            forgotPasswordEmailBody: `<h1 style="color: #ffffff;">Reset Protocol</h1><p>A password reset has been initiated. Proceed with the link below.</p><div style="margin-top: 40px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        },
        {
            name: "Emerald Aura",
            description: "Soft, nature-inspired palette with elegant curves.",
            thumbnailUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { font-family: 'Geogia', serif; background-color: #f0fdf4; margin: 0; padding: 0; }
                .wrapper { width: 100%; padding: 60px 0; background-color: #f0fdf4; }
                .wrap { max-width: 600px; margin: 0 auto; background: white; border-radius: 40px; border: 1px solid #dcfce7; box-shadow: 0 20px 40px rgba(5,150,105,0.05); }
                .hdr { padding: 48px; text-align: center; background: #ecfdf5; border-radius: 40px 40px 0 0; }
                .inner { padding: 48px; color: #064e3b; line-height: 1.8; font-size: 17px; }
                .ftr { padding: 48px; text-align: center; color: #065f46; font-size: 14px; border-top: 1px solid #f0fdf4; }
                .cta { background: #059669; color: white !important; padding: 16px 36px; border-radius: 100px; text-decoration: none; display: inline-block; font-weight: bold; box-shadow: 0 4px 12px rgba(5,150,105,0.2); }
            </style></head><body><div class="wrapper"><div class="wrap"><div class="hdr"><img src="#LOGO_URL#" height="50"></div><div class="inner">#CONTENT#</div><div class="ftr">#SOCIAL_LINKS#<p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "A warm, green welcome from #SHOP_NAME# 🌿",
            welcomeEmailBody: `<h1 style="color: #064e3b; font-size: 30px;">Hello there!</h1><p>We're so happy you've joined our community at #SHOP_NAME#. Together, we're growing something beautiful.</p><div style="margin-top:32px;"><a href="#DASHBOARD_URL#" class="cta">Start Your Journey</a></div>`,
            newOrderEmailSubject: "Thank you for your order! ##ID# 🌱",
            newOrderEmailBody: `<h1 style="color: #064e3b;">Wonderful Choice!</h1><p>We've received your order ##ID# and it's being handled with care.</p><div style="background: #f0fdf4; padding: 32px; border-radius: 24px; margin: 32px 0;">#ITEMS#<div style="margin-top:20px; border-top: 1px solid #dcfce7; padding-top:20px; font-weight: bold; font-size: 20px;">Total: #TOTAL#</div></div>`,
            lowStockEmailSubject: "Heads up: #PRODUCT# is almost gone! 🍃",
            lowStockEmailBody: `<h1 style="color: #059669;">Seasonal Alert</h1><p>Your beautiful <strong>#PRODUCT#</strong> is almost out of stock. Make sure to restock soon!</p>`,
            adminAlertEmailSubject: "Our community is growing! 🏢",
            adminAlertEmailBody: `<h1 style="color: #064e3b;">New Partner</h1><p>Exciting news! <strong>#SHOP_NAME#</strong> (#EMAIL#) is now live and growing with us.</p>`,
            verifyEmailSubject: "Welcome to our garden! 🌿 Please verify your email",
            verifyEmailBody: `<h1 style="color: #064e3b; font-size: 30px;">Let's get started</h1><p>We're almost ready! Just one last step to verify your account.</p><div style="margin-top:32px;"><a href="#VERIFY_LINK#" class="cta">Verify Account</a></div>`,
            forgotPasswordEmailSubject: "Resetting your path at #SHOP_NAME#",
            forgotPasswordEmailBody: `<h1 style="color: #064e3b;">Password Reset</h1><p>Lost your way? No worries. Here is the link to reset your account password.</p><div style="margin-top:32px;"><a href="#RESET_LINK#" class="cta">Set New Password</a></div>`
        },
        {
            name: "Corporate Trust",
            description: "Professional and reliable design. Best for B2B.",
            thumbnailUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 0; }
                .wrapper { width: 100%; background-color: #f1f5f9; padding: 40px 0; }
                .card { max-width: 600px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
                .head { padding: 32px; border-bottom: 4px solid #1e3a8a; background: #ffffff; }
                .body { padding: 48px; color: #334155; line-height: 1.6; font-size: 16px; }
                .foot { padding: 32px; font-size: 12px; color: #64748b; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0; }
                .btn { background: #1e3a8a; color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; }
            </style></head><body><div class="wrapper"><div class="card"><div class="head"><img src="#LOGO_URL#" height="40"></div><div class="body">#CONTENT#</div><div class="foot">#SOCIAL_LINKS#<p style="margin-top: 20px;">&copy; #YEAR# #SHOP_NAME#. Authorized Communication.</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "Official Welcome to #SHOP_NAME# 🏢",
            welcomeEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Account Registration Confirmed</h2><p>Your institutional account on <strong>#SHOP_NAME#</strong> has been successfully verified and activated. You now have full access to our procurement platform.</p><div style="margin-top: 32px;"><a href="#DASHBOARD_URL#" class="btn">Access Corporate Dashboard</a></div>`,
            newOrderEmailSubject: "Order Confirmation: ##ID# ✅",
            newOrderEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Order Acknowledgment</h2><p>This email confirms receipt of Order ##ID#. Our logistics team is processing your request according to the service level agreement.</p><div style="margin: 32px 0; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">#ITEMS#<div style="margin-top: 20px; border-top: 2px solid #1e3a8a; padding-top: 20px; text-align: right; font-weight: bold; font-size: 18px;">Total Payable: #TOTAL#</div></div>`,
            lowStockEmailSubject: "Inventory Notification: Stock Level Low ⚠️",
            lowStockEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Automated Inventory Alert</h2><p>System analysis indicates that <strong>#PRODUCT#</strong> has reached its minimum threshold. Immediate replenishment is recommended to avoid supply disruption.</p>`,
            adminAlertEmailSubject: "System Log: New Registration #EMAIL#",
            adminAlertEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Administrative Log Entry</h2><p>A new entity has successfully completed the registration protocol.</p><div style="background: #f8fafc; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;"><p style="margin: 0;"><strong>Entity:</strong> #SHOP_NAME#</p><p style="margin: 10px 0 0;"><strong>Identifier:</strong> #EMAIL#</p></div>`,
            verifyEmailSubject: "System Access: Email Verification Required",
            verifyEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Verification Protocol</h2><p>Please formalize your account registration by verifying your email address.</p><div style="margin-top: 32px;"><a href="#VERIFY_LINK#" class="btn">Verify Credentials</a></div>`,
            forgotPasswordEmailSubject: "Security Alert: Password Reset Requested",
            forgotPasswordEmailBody: `<h2 style="color: #1e3a8a; margin-top: 0;">Password Recovery</h2><p>A request to reset your access credentials has been logged. Use the link below to proceed.</p><div style="margin-top: 32px;"><a href="#RESET_LINK#" class="btn">Recover Access</a></div>`
        },
        {
            name: "Playful Pop",
            description: "High energy, colorful, and fun.",
            thumbnailUrl: "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #FFEB3B; padding: 0; margin: 0; font-family: 'Comic Sans MS', sans-serif; }
                .wrapper { width: 100%; background: #FFEB3B; padding: 40px 0; }
                .box { max-width: 600px; margin: 0 auto; background: white; border: 6px solid #000; border-radius: 32px; padding: 48px; box-shadow: 16px 16px 0 #000; position: relative; overflow: hidden; }
                .btn { background: #e91e63; color: white !important; padding: 20px 40px; border: 4px solid #000; border-radius: 16px; font-weight: 900; text-decoration: none; display: inline-block; font-size: 20px; box-shadow: 8px 8px 0 #000; }
                .footer { margin-top: 48px; text-align: center; font-size: 14px; font-weight: bold; border-top: 4px dashed #000; padding-top: 32px; }
            </style></head><body><div class="wrapper"><div class="box"><div style="text-align: center; margin-bottom: 40px;"><img src="#LOGO_URL#" height="80"></div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p>YOU ARE AWESOME!</p><p>&copy; #YEAR# #SHOP_NAME#</p><p>Unsubscribe <a href="#UNSUBSCRIBE_URL#">here</a></p></div></div></div></body></html>`,
            welcomeEmailSubject: "YAY! Welcome to #SHOP_NAME#! 🎉",
            welcomeEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">High Five! ✋</h1><p style="font-size: 20px;">You're in! Welcome to the coolest shop on the internet: <strong>#SHOP_NAME#</strong>. Get ready for some serious fun!</p><div style="text-align: center; margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn">LET'S GOOO!</a></div>`,
            newOrderEmailSubject: "BOOM! Order ##ID# received! 🚀",
            newOrderEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">Woohoo!</h1><p style="font-size: 20px;">Your order ##ID# is in the bag! We're doing a happy dance right now! 💃</p><div style="background: #f0f0f0; border: 4px solid #000; padding: 24px; border-radius: 20px; margin: 32px 0;">#ITEMS#<div style="font-size: 24px; font-weight: 900; text-align: right; margin-top: 20px;">TOTAL: #TOTAL#</div></div>`,
            lowStockEmailSubject: "Quick! #PRODUCT# is running away! 🏃",
            lowStockEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">Oh Noo!</h1><p style="font-size: 20px;"><strong>#PRODUCT#</strong> is almost out of stock! Grab it before it disappears into the void! 💨</p>`,
            adminAlertEmailSubject: "New friend alert! #EMAIL# 🎈",
            adminAlertEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">Guess What?</h1><p style="font-size: 20px;"><strong>#SHOP_NAME#</strong> just joined the party! Let's show them a great time! 🎊</p>`,
            verifyEmailSubject: "Double check! Is this really you? 🔎",
            verifyEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">Quick Step!</h1><p style="font-size: 20px;">We just need to make sure you're really you! Click the button to verify!</p><div style="text-align: center; margin-top: 40px;"><a href="#VERIFY_LINK#" class="btn">VERIFY NOW!</a></div>`,
            forgotPasswordEmailSubject: "Oops! Forgot your password? 🙊",
            forgotPasswordEmailBody: `<h1 style="font-size: 40px; margin-top: 0;">No Problem!</h1><p style="font-size: 20px;">Forgot your password? It happens to the best of us! Here's a link to fix it!</p><div style="text-align: center; margin-top: 40px;"><a href="#RESET_LINK#" class="btn">RESET PASSWORD</a></div>`
        },
        {
            name: "Luxe Minimal",
            description: "Ultra-premium, white-label feel.",
            thumbnailUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { margin: 0; padding: 0; background: #ffffff; }
                .wrapper { width: 100%; background: #ffffff; padding: 80px 0; }
                .container { max-width: 600px; margin: 0 auto; font-family: 'Optima', 'Didot', 'Times New Roman', serif; color: #111; line-height: 1.5; }
                .header { text-align: center; letter-spacing: 10px; text-transform: uppercase; font-size: 20px; padding-bottom: 80px; }
                .content { padding: 80px 0; border-top: 0.5px solid #222; border-bottom: 0.5px solid #222; }
                .footer { padding-top: 80px; text-align: center; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #666; }
                .btn { display: inline-block; border: 0.5px solid #222; padding: 16px 48px; text-decoration: none; color: #000 !important; text-transform: uppercase; letter-spacing: 3px; font-size: 12px; margin-top: 40px; }
            </style></head><body><div class="wrapper"><div class="container"><div class="header">#SHOP_NAME#</div><div class="content">#CONTENT#</div><div class="footer">#SOCIAL_LINKS#<p style="margin-top: 40px;">&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "Introduction to #SHOP_NAME#",
            welcomeEmailBody: `<h1 style="font-weight: lighter; font-size: 32px; margin-top: 0; text-align: center;">Welcome.</h1><p style="text-align: center; font-style: italic; font-size: 18px;">It is our profound pleasure to welcome you to the world of #SHOP_NAME#. We invite you to explore our curated collections.</p><div style="text-align: center;"><a href="#DASHBOARD_URL#" class="btn">Discover Collections</a></div>`,
            newOrderEmailSubject: "Your Selection: Order ##ID#",
            newOrderEmailBody: `<p style="text-transform: uppercase; letter-spacing: 2px; margin-bottom: 32px;">Order Acknowledgment</p><p>We have received your selection ##ID#. Our artisans are currently finalizing your order.</p><div style="margin: 48px 0;">#ITEMS#<div style="text-align: right; border-top: 1px solid #eee; padding-top: 20px; letter-spacing: 2px;">Value / #TOTAL#</div></div>`,
            lowStockEmailSubject: "Limited Availability: #PRODUCT#",
            lowStockEmailBody: `<p style="text-transform: uppercase; letter-spacing: 2px; margin-bottom: 32px;">Inventory Report</p><p>Please be advised that inventory for <strong>#PRODUCT#</strong> is reaching final quantities. We may not be able to fulfill subsequent requests.</p>`,
            adminAlertEmailSubject: "New Registration: #SHOP_NAME#",
            adminAlertEmailBody: `<p style="text-transform: uppercase; letter-spacing: 2px; margin-bottom: 32px;">Registry Update</p><p>A new entity, <strong>#SHOP_NAME#</strong>, has successfully registered within the luxury network.</p>`,
            verifyEmailSubject: "Verification Request",
            verifyEmailBody: `<h1 style="font-weight: lighter; font-size: 32px; margin-top: 0; text-align: center;">Verification.</h1><p style="text-align: center; font-style: italic; font-size: 18px;">To maintain the exclusivity of our network, we kindly request you to verify your email address.</p><div style="text-align: center;"><a href="#VERIFY_LINK#" class="btn">Confirm Identity</a></div>`,
            forgotPasswordEmailSubject: "Account Recovery",
            forgotPasswordEmailBody: `<h1 style="font-weight: lighter; font-size: 32px; margin-top: 0; text-align: center;">Reset.</h1><p style="text-align: center; font-style: italic; font-size: 18px;">A request has been made to reset your account password. You may proceed using the link below.</p><div style="text-align: center;"><a href="#RESET_LINK#" class="btn">New Password</a></div>`
        },
        {
            name: "Retro vibe",
            description: "80s inspired retro aesthetic.",
            thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #2d1b4e; color: #ff00ff; font-family: 'Courier New', monospace; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #2d1b4e; padding: 40px 0; }
                .terminal { max-width: 600px; margin: 0 auto; border: 4px solid #00ffff; background: #1a0f2e; padding: 40px; box-shadow: 0 0 20px #00ffff; }
                .btn { display: inline-block; background: #ff00ff; color: #ffffff !important; padding: 12px 24px; border: 2px solid #00ffff; text-decoration: none; font-weight: bold; text-transform: uppercase; margin-top: 20px; }
                .footer { margin-top: 40px; border-top: 2px solid #00ffff; padding-top: 20px; font-size: 12px; color: #00ffff; text-align: center; }
            </style></head><body><div class="wrapper"><div class="terminal"><div style="color: #00ffff; font-weight: bold; margin-bottom: 20px;">> #SHOP_NAME# SYSTEM INITIALIZED...</div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p>> LOG_DATA: &copy; #YEAR# #SHOP_NAME#</p><p>> LOC_DATA: #SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "System Online: Welcome #SHOP_NAME# 🕹️",
            welcomeEmailBody: `<h1 style="color: #00ffff; border-bottom: 2px solid #ff00ff; padding-bottom: 10px;">ACCESS GRANTED</h1><p>Welcome to the grid. <strong>#SHOP_NAME#</strong> node has been successfully established and synced. Prepare for data transfer.</p><div style="text-align: center;"><a href="#DASHBOARD_URL#" class="btn">ENTER SYSTEM</a></div>`,
            newOrderEmailSubject: "New Data Pack: Order ##ID# 💾",
            newOrderEmailBody: `<h1 style="color: #00ffff;">TRANSFER INITIATED</h1><p>Order ##ID# detected in the stream. Processing cargo...</p><div style="border: 2px dashed #ff00ff; padding: 20px; margin: 24px 0;">#ITEMS#<p style="margin-top: 20px; color: #00ffff; font-weight: bold;">TOTAL_VALUE: #TOTAL#</p></div>`,
            lowStockEmailSubject: "Buffer Underrun: #PRODUCT# ⚠️",
            lowStockEmailBody: `<h1 style="color: #f72585;">CRITICAL WARNING</h1><p>Resource <strong>#PRODUCT#</strong> is depleted. Buffer underrun imminent. Prompt action required.</p>`,
            adminAlertEmailSubject: "New Terminal: #EMAIL# ⚡",
            adminAlertEmailBody: `<h1 style="color: #00ffff;">NEW NODE DETECTED</h1><p>A new terminal, <strong>#SHOP_NAME#</strong>, has pinged the central server.</p>`,
            verifyEmailSubject: "System Access: Verify Code #EMAIL# ⚡",
            verifyEmailBody: `<h1 style="color: #00ffff; border-bottom: 2px solid #ff00ff; padding-bottom: 10px;">ID VERIFICATION</h1><p>Identify yourself. To complete the handshake, verify your email address via the link below.</p><div style="text-align: center;"><a href="#VERIFY_LINK#" class="btn">VERIFY HANDSHAKE</a></div>`,
            forgotPasswordEmailSubject: "Access Recovery: Reset Password 🔐",
            forgotPasswordEmailBody: `<h1 style="color: #00ffff; border-bottom: 2px solid #ff00ff; padding-bottom: 10px;">RESET ACCESS</h1><p>Password reset requested. Override existing credentials using the link below.</p><div style="text-align: center;"><a href="#RESET_LINK#" class="btn">INITIATE RESET</a></div>`
        },
        {
            name: "Eco Canvas",
            description: "Natural, recycled paper look.",
            thumbnailUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #f4f1ea; font-family: 'Palatino', 'Georgia', serif; color: #3d3d3d; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #f4f1ea; padding: 60px 0; }
                .canvas { max-width: 600px; margin: 0 auto; background: #fdfcf9; border: 1px solid #e0dcd0; border-radius: 4px; padding: 60px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
                .footer { margin-top: 60px; border-top: 1px solid #e0dcd0; padding-top: 40px; text-align: center; color: #7a7a7a; font-size: 14px; }
                .btn { background: #5d6d5e; color: #ffffff !important; padding: 14px 28px; border-radius: 2px; text-decoration: none; display: inline-block; font-style: italic; }
            </style></head><body><div class="wrapper"><div class="canvas"><div style="text-align: center; margin-bottom: 60px;"><img src="#LOGO_URL#" height="50"></div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p style="margin-top: 20px;"><em>Part of a sustainable journey.</em></p><p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "Growing Together at #SHOP_NAME# 🌱",
            welcomeEmailBody: `<h1 style="color: #2d3a2d; font-weight: normal; margin-top: 0;">A Natural Beginning</h1><p>Thank you for choosing to grow with <strong>#SHOP_NAME#</strong>. We believe in quality, sustainability, and the beauty of starting something new.</p><div style="text-align: center; margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn">Explore Our Roots</a></div>`,
            newOrderEmailSubject: "Harvest Confirmed: Order ##ID# 🧺",
            newOrderEmailBody: `<h1 style="color: #2d3a2d; font-weight: normal;">Hand-Picked Order</h1><p>We've received your harvest selection ##ID#. Our team is carefully preparing your package.</p><div style="background: #fdfcf9; border: 1px solid #e0dcd0; padding: 24px; margin: 32px 0;">#ITEMS#<p style="margin-top: 20px; border-top: 1px solid #e0dcd0; padding-top: 16px; font-weight: bold;">Valuation: #TOTAL#</p></div>`,
            lowStockEmailSubject: "Sustainability Alert: #PRODUCT# 🍂",
            lowStockEmailBody: `<h1 style="color: #8c7851; font-weight: normal;">Nature's Cycle</h1><p>Our supply of <strong>#PRODUCT#</strong> is waning. As seasons change, so does our stock. Secure yours before it's gone.</p>`,
            adminAlertEmailSubject: "New Shop Sown: #SHOP_NAME#",
            adminAlertEmailBody: `<h1 style="color: #2d3a2d; font-weight: normal;">New Growth Detected</h1><p>A new shop, <strong>#SHOP_NAME#</strong>, has been sown into our ecosystem.</p>`,
            verifyEmailSubject: "Nurturing Your New Account at #SHOP_NAME# 🌱",
            verifyEmailBody: `<h1 style="color: #2d3a2d; font-weight: normal; margin-top: 0;">Final Step</h1><p>We're almost there. To finalize your account setup, please verify your email address below.</p><div style="text-align: center; margin-top: 40px;"><a href="#VERIFY_LINK#" class="btn">Confirm Email</a></div>`,
            forgotPasswordEmailSubject: "Restoring Your Connection to #SHOP_NAME#",
            forgotPasswordEmailBody: `<h1 style="color: #2d3a2d; font-weight: normal; margin-top: 0;">Account Recovery</h1><p>We received a request to reset your password. Use the link below to restore your access.</p><div style="text-align: center; margin-top: 40px;"><a href="#RESET_LINK#" class="btn">Set New Password</a></div>`
        },
        {
            name: "Indigo Night",
            description: "Dark mode with deep indigo and electric blue.",
            thumbnailUrl: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #0f172a; color: #f8fafc; font-family: 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #0f172a; padding: 40px 0; }
                .card { max-width: 600px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; }
                .header { padding: 40px; text-align: center; background: #312e81; }
                .content { padding: 48px; line-height: 1.6; }
                .footer { padding: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #334155; }
                .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
            </style></head><body><div class="wrapper"><div class="card"><div class="header"><img src="#LOGO_URL#" height="40"></div><div class="content">#CONTENT#</div><div class="footer">#SOCIAL_LINKS#<p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "The Night is Young: Welcome to #SHOP_NAME# 🌙",
            welcomeEmailBody: `<h1 style="margin-top: 0; color: #818cf8;">Welcome to the Night</h1><p>Experience the electric energy of <strong>#SHOP_NAME#</strong>. Your access to our exclusive collection is now active.</p><div style="text-align: center; margin-top: 32px;"><a href="#DASHBOARD_URL#" class="btn">Ignite the Night</a></div>`,
            newOrderEmailSubject: "Package In Transit: Order ##ID# 🛸",
            newOrderEmailBody: `<h1 style="color: #818cf8;">Signal Confirmed</h1><p>Order ##ID# has been intercepted and is now in transit across the digital void.</p><div style="background: #0f172a; padding: 24px; border-radius: 12px; margin: 32px 0;">#ITEMS#<div style="margin-top: 20px; font-weight: bold; color: #818cf8;">TOTAL_TRANSFER: #TOTAL#</div></div>`,
            lowStockEmailSubject: "Signal Warning: #PRODUCT# 📡",
            lowStockEmailBody: `<h1 style="color: #f43f5e;">Low Signal Alert</h1><p>Our sensors indicate fading signals for <strong>#PRODUCT#</strong>. Inventory is dangerously low.</p>`,
            adminAlertEmailSubject: "New Connection: #EMAIL# 🪐",
            adminAlertEmailBody: `<h1 style="color: #818cf8;">New Connection Established</h1><p>A new partner connection for <strong>#SHOP_NAME#</strong> has been successfully authenticated.</p>`,
            verifyEmailSubject: "Authentication: Verify Your Account 📡",
            verifyEmailBody: `<h1 style="margin-top: 0; color: #818cf8;">Verify Connection</h1><p>To secure your connection to the <strong>#SHOP_NAME#</strong> network, please verify your email address below.</p><div style="text-align: center; margin-top: 32px;"><a href="#VERIFY_LINK#" class="btn">Verify Now</a></div>`,
            forgotPasswordEmailSubject: "Security Protocol: Password Reset 🪐",
            forgotPasswordEmailBody: `<h1 style="margin-top: 0; color: #818cf8;">Reset Signal</h1><p>A password reset signal has been received. Authenticate your new password via the link below.</p><div style="text-align: center; margin-top: 32px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        },
        {
            name: "Golden Hour",
            description: "Warm amber and gold tones.",
            thumbnailUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #fffcf0; font-family: 'Garamond', serif; color: #451a03; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #fffcf0; padding: 60px 0; }
                .sunset { max-width: 600px; margin: 0 auto; background: white; border-top: 12px solid #fbbf24; border-radius: 4px; padding: 60px; box-shadow: 0 30px 60px rgba(251,191,36,0.1); }
                .footer { margin-top: 60px; text-align: center; border-top: 1px solid #fef3c7; padding-top: 40px; color: #92400e; font-size: 14px; }
                .btn { display: inline-block; background: #d97706; color: #ffffff !important; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-style: italic; }
            </style></head><body><div class="wrapper"><div class="sunset"><div style="text-align: center; margin-bottom: 60px;"><img src="#LOGO_URL#" height="50"></div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p style="margin-top: 20px;"><em>Basking in the glow of #SHOP_NAME#.</em></p><p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "A Golden Welcome from #SHOP_NAME# ✨",
            welcomeEmailBody: `<h1 style="color: #92400e; font-style: italic; font-weight: normal; margin-top: 0;">A New Dawn</h1><p>We're absolutely glowing with joy to have you at <strong>#SHOP_NAME#</strong>. Every beginning is precious, and we're honored to spend this hour with you.</p><div style="text-align: center; margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn">Discover the Glow</a></div>`,
            newOrderEmailSubject: "Precious Cargo: Order ##ID# 💎",
            newOrderEmailBody: `<h1 style="color: #92400e; font-style: italic; font-weight: normal;">Order Secured</h1><p>Congratulations! Your Order ##ID# has been confirmed and is now being prepared under the golden sun.</p><div style="background: #fffcf0; padding: 32px; border-radius: 8px; margin: 32px 0;">#ITEMS#<div style="margin-top: 20px; text-align: right; color: #b45309; font-weight: bold; font-size: 20px;">Value Found: #TOTAL#</div></div>`,
            lowStockEmailSubject: "Inventory Alert: #PRODUCT# 🕰️",
            lowStockEmailBody: `<h1 style="color: #d97706; font-style: italic; font-weight: normal;">Sands are Slipping</h1><p>Our supply of <strong>#PRODUCT#</strong> is running low. Don't let the sunset on your chance to secure yours.</p>`,
            adminAlertEmailSubject: "New Spark: #SHOP_NAME#",
            adminAlertEmailBody: `<h1 style="color: #92400e; font-style: italic; font-weight: normal;">New Vitality</h1><p>A new spark, <strong>#SHOP_NAME#</strong>, has ignited within our network.</p>`,
            verifyEmailSubject: "A Bright Beginning: Verify Your Email ✨",
            verifyEmailBody: `<h1 style="color: #92400e; font-style: italic; font-weight: normal; margin-top: 0;">Almost There</h1><p>Just one small step to finish your registration. Please verify your email address below.</p><div style="text-align: center; margin-top: 40px;"><a href="#VERIFY_LINK#" class="btn">Verify Account</a></div>`,
            forgotPasswordEmailSubject: "Restoring Your Glow at #SHOP_NAME#",
            forgotPasswordEmailBody: `<h1 style="color: #92400e; font-style: italic; font-weight: normal; margin-top: 0;">Recovery</h1><p>Forgot your password? Let's fix that. Use the link below to set a new one and get back to glowing.</p><div style="text-align: center; margin-top: 40px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        },
        {
            name: "Simple Slate",
            description: "Hyper-clean and professional.",
            thumbnailUrl: "https://images.unsplash.com/photo-1454165833767-02a6e0503d21?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #f1f5f9; font-family: 'Inter', system-ui, sans-serif; color: #334155; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #f1f5f9; padding: 40px 0; }
                .slate { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 48px; }
                .footer { margin-top: 48px; padding-top: 32px; border-top: 1px solid #f1f5f9; text-align: center; color: #64748b; font-size: 13px; }
                .btn { display: inline-block; background: #334155; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; }
            </style></head><body><div class="wrapper"><div class="slate"><div style="margin-bottom: 40px;"><img src="#LOGO_URL#" height="32"></div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p style="margin-top: 20px;">&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "Welcome to #SHOP_NAME#",
            welcomeEmailBody: `<h1 style="color: #0f172a; margin-top: 0; font-weight: 600; letter-spacing: -0.01em;">Welcome</h1><p>Your account at <strong>#SHOP_NAME#</strong> is ready for use. We've simplified the shopping experience so you can find what you need, fast.</p><div style="margin-top: 32px;"><a href="#DASHBOARD_URL#" class="btn">Get Started</a></div>`,
            newOrderEmailSubject: "Order ##ID# - #SHOP_NAME#",
            newOrderEmailBody: `<h1 style="color: #0f172a; font-weight: 600;">Order Confirmed</h1><p>Summary for Order ##ID#. We'll notify you once it ships.</p><div style="margin: 32px 0;">#ITEMS#<table width="100%" style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 16px;"><tr><td style="color: #64748b;">Total</td><td style="text-align: right; color: #0f172a; font-weight: 600;">#TOTAL#</td></tr></table></div>`,
            lowStockEmailSubject: "Stock Alert: #PRODUCT#",
            lowStockEmailBody: `<h1 style="color: #0f172a; font-weight: 600;">Inventory Alert</h1><p>Inventory level for <strong>#PRODUCT#</strong> is below the suggested threshold.</p>`,
            adminAlertEmailSubject: "Account Alert: #SHOP_NAME#",
            adminAlertEmailBody: `<h1 style="color: #0f172a; font-weight: 600;">Registration Update</h1><p>Profile for <strong>#SHOP_NAME#</strong> has been created.</p>`,
            verifyEmailSubject: "Verify your email - #SHOP_NAME#",
            verifyEmailBody: `<h1 style="color: #0f172a; margin-top: 0; font-weight: 600;">Email Verification</h1><p>Please click the button below to verify your email address and activate your account.</p><div style="margin-top: 32px;"><a href="#VERIFY_LINK#" class="btn">Verify Account</a></div>`,
            forgotPasswordEmailSubject: "Reset password - #SHOP_NAME#",
            forgotPasswordEmailBody: `<h1 style="color: #0f172a; margin-top: 0; font-weight: 600;">Password Reset</h1><p>We received a request to reset your password. Click the button below to proceed.</p><div style="margin-top: 32px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        },
        {
            name: "Velvet Rose",
            description: "Soft pinks and deep burgundies.",
            thumbnailUrl: "https://images.unsplash.com/photo-1518199266791-73ad7858e805?auto=format&fit=crop&q=80&w=200&h=150",
            globalEmailTemplate: `<!DOCTYPE html><html><head><style>
                body { background: #fff1f2; font-family: 'Palatino', serif; color: #881337; margin: 0; padding: 0; }
                .wrapper { width: 100%; background: #fff1f2; padding: 60px 0; }
                .rose { max-width: 600px; margin: 0 auto; background: white; border: 1px solid #fecdd3; border-radius: 32px; padding: 60px; box-shadow: 0 20px 40px rgba(159,18,57,0.05); }
                .footer { margin-top: 60px; text-align: center; border-top: 1px solid #fff1f2; padding-top: 40px; color: #be123c; font-size: 14px; }
                .btn { display: inline-block; background: #be123c; color: #ffffff !important; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: bold; }
            </style></head><body><div class="wrapper"><div class="rose"><div style="text-align: center; margin-bottom: 60px;"><img src="#LOGO_URL#" height="50"></div>#CONTENT#<div class="footer">#SOCIAL_LINKS#<p style="margin-top: 20px;"><em>Blooming with elegance at #SHOP_NAME#.</em></p><p>&copy; #YEAR# #SHOP_NAME#</p><p>#SHOP_ADDRESS#</p></div></div></div></body></html>`,
            welcomeEmailSubject: "A Sweet Hello from #SHOP_NAME# 🌹",
            welcomeEmailBody: `<h1 style="color: #9f1239; margin-top: 0; font-weight: normal;">A Sweet Welcome</h1><p>We're absolutely delighted to have you join us at <strong>#SHOP_NAME#</strong>. Your presence makes our bouquet complete.</p><div style="text-align: center; margin-top: 40px;"><a href="#DASHBOARD_URL#" class="btn">Enter the Boutique</a></div>`,
            newOrderEmailSubject: "Tucked & Ready: Order ##ID# 🎁",
            newOrderEmailBody: `<h1 style="color: #9f1239; font-weight: normal;">Gift Received</h1><p>We've received your Order ##ID#. Our team is tucking everything in beautifully for you.</p><div style="background: #fff1f2; padding: 32px; border-radius: 20px; margin: 32px 0;">#ITEMS#<p style="margin-top: 20px; text-align: right; color: #e11d48; font-weight: bold;">Valuation: #TOTAL#</p></div>`,
            lowStockEmailSubject: "Limited Edition Alert: #PRODUCT# 🥀",
            lowStockEmailBody: `<h1 style="color: #e11d48; font-weight: normal;">Almost Gone</h1><p>Inventory for <strong>#PRODUCT#</strong> is reaching its final petals. Secure yours before the season ends.</p>`,
            adminAlertEmailSubject: "New Boutique: #SHOP_NAME# 🎀",
            adminAlertEmailBody: `<h1 style="color: #9f1239; font-weight: normal;">New Petal Added</h1><p>A new boutique, <strong>#SHOP_NAME#</strong>, has successfully registered.</p>`,
            verifyEmailSubject: "Final Polishing: Verify Your Email 🎀",
            verifyEmailBody: `<h1 style="color: #9f1239; margin-top: 0; font-weight: normal;">Account Verification</h1><p>To finalize your registration, please verify your email address using the button below.</p><div style="text-align: center; margin-top: 40px;"><a href="#VERIFY_LINK#" class="btn">Verify Now</a></div>`,
            forgotPasswordEmailSubject: "Account Help from #SHOP_NAME# 🌹",
            forgotPasswordEmailBody: `<h1 style="color: #9f1239; margin-top: 0; font-weight: normal;">Password Help</h1><p>Need to reset your password? No problem. Use the link below to get back to your boutique.</p><div style="text-align: center; margin-top: 40px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>`
        }
    ];

    const extraFields = {
        verifyEmailSubject: "Verify your ShopSync account",
        verifyEmailBody: "<p>Please verify your account by clicking the button.</p>",
        forgotPasswordEmailSubject: "Reset your ShopSync password",
        forgotPasswordEmailBody: "<p>Click the button below to proceed.</p>",
        orderConfirmationSubject: "Order Confirmed! ✅",
        orderConfirmationBody: "<p>Your order ##ID# has been confirmed.</p>",
        orderCancelledSubject: "Order Cancelled 🚫",
        orderCancelledBody: "<p>Your order ##ID# has been cancelled.</p>",
        orderReturnedSubject: "Return Received 📦",
        orderReturnedBody: "<p>We have received the return for order ##ID#.</p>",
        shippingUpdateSubject: "Your Package is on the Way! 🚚",
        shippingUpdateBody: "<p>Your order ##ID# is on the way.</p>",
        subscriptionActivatedSubject: "Subscription Activated! ✨",
        subscriptionActivatedBody: "<p>Your subscription is now active.</p>",
        paymentReceivedSubject: "Payment Proof Received 📥",
        paymentReceivedBody: "<p>We have received your payment proof.</p>",
        paymentRejectedSubject: "Payment Verification Failed ❌",
        paymentRejectedBody: "<p>Your payment verification failed.</p>",
        trialExpirySubject: "Trial Ending Soon! ⏳",
        trialExpiryBody: "<p>Your trial is ending soon.</p>",
        trialExpiredSubject: "Trial Expired 🔒",
        trialExpiredBody: "<p>Your trial is expired.</p>"
    };

    for (const preset of PRESETS) {
        await prisma.emailPreset.create({
            data: { ...extraFields, ...(preset as any) }
        });
    }
    console.log('✅ Seeded 12 premium presets successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
