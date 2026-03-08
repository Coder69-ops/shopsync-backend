import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESETS = [
    {
        name: "Modern Sleek",
        description: "Minimalist and clean design with high-contrast typography. Best for fashion or tech.",
        thumbnailUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Inter', -apple-system, blinkmacsystemfont, 'Segoe UI', roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 0; color: #1e293b; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); }
        .header { padding: 40px; text-align: center; background: #ffffff; }
        .logo { height: 48px; width: auto; }
        .content { padding: 40px; line-height: 1.6; }
        .footer { padding: 40px; text-align: center; border-top: 1px solid #f1f5f9; font-size: 13px; color: #94a3b8; }
        .btn-container { text-align: center; margin-top: 32px; }
        .btn { display: inline-block; background-color: #0f172a; color: #ffffff !important; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="#LOGO_URL#" alt="#SHOP_NAME#" class="logo">
        </div>
        <div class="content">
            #CONTENT#
        </div>
        <div class="footer">
            <p>&copy; #YEAR# #SHOP_NAME#. All rights reserved.</p>
            <p><a href="#DASHBOARD_URL#" style="color: #64748b; text-decoration: none;">View Dashboard</a></p>
        </div>
    </div>
</body>
</html>`,
        welcomeEmailSubject: "Welcome to #SHOP_NAME#! 🥂",
        welcomeEmailBody: `<h1 style="font-size: 28px; font-weight: 800; margin-bottom: 24px;">Welcome aboard!</h1>
<p style="font-size: 16px; color: #475569;">We're thrilled to have you here at <strong>#SHOP_NAME#</strong>. Your journey to exceptional shopping starts now.</p>
<p style="font-size: 16px; color: #475569; margin-top: 16px;">Explore our curated collections and discover pieces that speak to you.</p>
<div class="btn-container">
    <a href="#DASHBOARD_URL#" class="btn">Start Shopping</a>
</div>`,
        newOrderEmailSubject: "Confirmed! Your order ##ID# is here 📦",
        newOrderEmailBody: `<h1 style="font-size: 28px; font-weight: 800; margin-bottom: 24px;">Order Confirmed!</h1>
<p style="font-size: 16px; color: #475569;">Great news! We've received your order <strong>##ID#</strong> and our team is already preparing it for you.</p>
<div style="margin: 32px 0; background: #f8fafc; border-radius: 16px; padding: 24px;">
    #ITEMS#
    <div style="margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; font-weight: 800; font-size: 18px;">
        <span>Total</span>
        <span>#TOTAL#</span>
    </div>
</div>
<div class="btn-container">
    <a href="#DASHBOARD_URL#" class="btn">Track Order</a>
</div>`,
        lowStockEmailSubject: "⚠️ Inventory Alert: #PRODUCT#",
        lowStockEmailBody: `<h1 style="font-size: 28px; font-weight: 800; margin-bottom: 24px; color: #e11d48;">Stock Alert!</h1>
<p style="font-size: 16px; color: #475569;">Heads up! Your product <strong>#PRODUCT#</strong> is running low. Only a few units left in stock.</p>
<p style="font-size: 16px; color: #475569; margin-top: 16px;">Ensure smooth sales by restocking soon.</p>
<div class="btn-container">
    <a href="#DASHBOARD_URL#" class="btn">Restock Now</a>
</div>`,
        adminAlertEmailSubject: "New Merchant signup: #EMAIL# 🏢",
        adminAlertEmailBody: `<h1 style="font-size: 28px; font-weight: 800; margin-bottom: 24px;">New Registration</h1>
<p style="font-size: 16px; color: #475569;">A new shop owner has just joined the platform.</p>
<div style="margin: 24px 0; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 12px;">
    <strong>Email:</strong> #EMAIL#<br>
    <strong>Shop Name:</strong> #SHOP_NAME#
</div>
<div class="btn-container">
    <a href="#DASHBOARD_URL#" class="btn">Review Dashboard</a>
</div>`
    },
    {
        name: "Midnight Pro",
        description: "Sophisticated dark theme with vibrant accents. Perfect for high-end electronics or luxury goods.",
        thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #0c0a09; margin: 0; padding: 40px 0; }
        .container { max-width: 600px; margin: 0 auto; background: #1c1917; border: 1px solid #292524; border-radius: 16px; }
        .header { padding: 40px; text-align: center; border-bottom: 1px solid #292524; }
        .content { padding: 40px; color: #d6d3d1; line-height: 1.6; }
        .footer { padding: 40px; text-align: center; color: #78716c; font-size: 12px; }
        .btn { display: inline-block; background: #10b981; color: #000000 !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><img src="#LOGO_URL#" height="40"></div>
        <div class="content">#CONTENT#</div>
        <div class="footer">&copy; #YEAR# #SHOP_NAME# | Dark Mode Premium</div>
    </div>
</body>
</html>`,
        welcomeEmailSubject: "Midnight Welcome from #SHOP_NAME# 🌌",
        welcomeEmailBody: `<h1 style="color: #ffffff;">Welcome to the future.</h1>
<p>Thank you for choosing #SHOP_NAME#. We're excited to show you what's possible when design meets technology.</p>
<div style="margin-top: 30px;"><a href="#DASHBOARD_URL#" class="btn">Explore Now</a></div>`,
        newOrderEmailSubject: "Order Received: ##ID# 💫",
        newOrderEmailBody: `<h1 style="color: #ffffff;">Order Locked In.</h1>
<p>Your order ##ID# is confirmed and moving into production.</p>
<div style="background: #292524; padding: 20px; border-radius: 12px; margin: 20px 0;">#ITEMS#</div>
<p style="font-weight: bold; color: #10b981;">Total Paid: #TOTAL#</p>`,
        lowStockEmailSubject: "Critical Stock Warning: #PRODUCT# 🚨",
        lowStockEmailBody: `<h1 style="color: #ef4444;">Flash Inventory Alert</h1>
<p>#PRODUCT# inventory is nearly depleted. Act now to maintain availability.</p>
<div style="margin-top: 30px;"><a href="#DASHBOARD_URL#" class="btn">Manage Stock</a></div>`,
        adminAlertEmailSubject: "Platform Growth: New Signup #EMAIL# 🚀",
        adminAlertEmailBody: `<h1 style="color: #ffffff;">New Node Added</h1>
<p>Entity: #SHOP_NAME#<br>Identifier: #EMAIL#</p>
<p>The network is expanding.</p>`
    },
    {
        name: "Emerald Aura",
        description: "Soft, nature-inspired palette with elegant curves. Ideal for organic products or wellness brands.",
        thumbnailUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Helvetica', sans-serif; background-color: #f0fdf4; margin: 0; padding: 40px 0; }
        .wrap { max-width: 600px; margin: 0 auto; background: white; border-radius: 30px; border: 1px solid #dcfce7; }
        .hdr { padding: 40px; text-align: center; background: #ecfdf5; border-radius: 30px 30px 0 0; }
        .inner { padding: 40px; color: #064e3b; }
        .ftr { padding: 40px; text-align: center; color: #065f46; font-size: 13px; opacity: 0.7; }
        .cta { background: #059669; color: white !important; padding: 14px 28px; border-radius: 50px; text-decoration: none; display: inline-block; font-weight: bold; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="hdr"><img src="#LOGO_URL#" height="50"></div>
        <div class="inner">#CONTENT#</div>
        <div class="ftr">&copy; #YEAR# #SHOP_NAME#. Naturally Crafted.</div>
    </div>
</body>
</html>`,
        welcomeEmailSubject: "A warm, green welcome from #SHOP_NAME# 🌿",
        welcomeEmailBody: `<h1 style="color: #064e3b;">Hello there!</h1>
<p>We're so happy you've joined our community at <strong>#SHOP_NAME#</strong>. Here, we value quality and sustainability above all else.</p>
<div style="margin-top:20px;"><a href="#DASHBOARD_URL#" class="cta">Start Your Journey</a></div>`,
        newOrderEmailSubject: "Thank you for your order! ##ID# 🌱",
        newOrderEmailBody: `<h1>Wonderful Choice!</h1>
<p>We've received your order and are getting it ready for its new home.</p>
<div style="border: 1px solid #dcfce7; padding: 20px; border-radius: 15px; margin: 20px 0;">#ITEMS#<br><strong>Total: #TOTAL#</strong></div>
<p>Expected delivery soon!</p>`,
        lowStockEmailSubject: "Heads up: #PRODUCT# is almost gone! 🍃",
        lowStockEmailBody: `<h1>Restock Needed</h1>
<p>Your beautiful <strong>#PRODUCT#</strong> is almost out of stock. Time to bring more in!</p>
<div style="margin-top:20px;"><a href="#DASHBOARD_URL#" class="cta">Inventory Manager</a></div>`,
        adminAlertEmailSubject: "Our community is growing! 🏢",
        adminAlertEmailBody: `<h1>New Partner</h1><p>#SHOP_NAME# (#EMAIL#) is now live on our platform. Let's grow together.</p>`
    },
    {
        name: "Corporate Trust",
        description: "Professional and reliable design. Best for B2B or serious retail ventures.",
        thumbnailUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><head><style>body{font-family: Arial, sans-serif; background: #eaeff2; padding: 20px;} .card{max-width: 600px; background: white; margin: auto; border: 1px solid #d1d9e0;} .head{padding: 20px; border-bottom: 4px solid #1e3a8a;} .body{padding: 30px;} .foot{padding: 20px; font-size: 11px; color:#666; background: #f8fafc; text-align: center;} .btn{background: #1e3a8a; color: white !important; padding: 10px 20px; text-decoration: none;}</style></head><body><div class="card"><div class="head"><img src="#LOGO_URL#" height="30"></div><div class="body">#CONTENT#</div><div class="foot">&copy; #YEAR# #SHOP_NAME# - Official Communication</div></div></body></html>`,
        welcomeEmailSubject: "Official Welcome to #SHOP_NAME# 🏢",
        welcomeEmailBody: `<h2>Account Verified</h2><p>Your account on #SHOP_NAME# is now active. You may now access all features of the platform.</p><a href="#DASHBOARD_URL#" class="btn">Access Dashboard</a>`,
        newOrderEmailSubject: "Order Confirmation: ##ID# ✅",
        newOrderEmailBody: `<h2>Order Confirmation</h2><p>This email confirms receipt of your order ##ID#.</p><div style="margin: 20px 0;">#ITEMS#<br>Total Amount: #TOTAL#</div>`,
        lowStockEmailSubject: "Inventory Notification: Stock Level Low ⚠️",
        lowStockEmailBody: `<h2>Stock Level Warning</h2><p>System alert: #PRODUCT# has reached the minimum threshold.</p>`,
        adminAlertEmailSubject: "System Log: New Registration #EMAIL#",
        adminAlertEmailBody: `<h2>Registration Log</h2><p>Shop: #SHOP_NAME#<br>Email: #EMAIL#</p>`
    },
    {
        name: "Playful Pop",
        description: "High energy, colorful, and fun. Great for stationery, kids' products, or quirky gifts.",
        thumbnailUrl: "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><head><style>body{background:#FFEB3B; padding:30px; font-family: 'Comic Sans MS', sans-serif;} .box{background:white; border:5px solid #000; border-radius:20px; padding:30px; box-shadow: 10px 10px 0 #000;} .btn{background:#e91e63; color:white !important; padding:15px; border:3px solid #000; font-weight:bold; text-decoration:none; display:inline-block;}</style></head><body><div class="box"><img src="#LOGO_URL#" height="60">#CONTENT#<div style="margin-top:20px; font-size:12px;">Woot woot! &copy; #YEAR# #SHOP_NAME#</div></div></body></html>`,
        welcomeEmailSubject: "YAY! Welcome to #SHOP_NAME#! 🎉",
        welcomeEmailBody: `<h1>High Five! ✋</h1><p>You're in! Welcome to <strong>#SHOP_NAME#</strong>. Let's find something awesome together!</p><a href="#DASHBOARD_URL#" class="btn">LET'S GOOO!</a>`,
        newOrderEmailSubject: "BOOM! Order ##ID# received! 🚀",
        newOrderEmailBody: `<h1>Woohoo!</h1><p>Your order ##ID# is in the bag! We're dancing in the warehouse right now.</p><div style="border: 3px solid #FFEB3B; padding:10px;">#ITEMS#<br>Total Price: #TOTAL#</div>`,
        lowStockEmailSubject: "Quick! #PRODUCT# is running away! 🏃",
        lowStockEmailBody: `<h1>Oh Noo!</h1><p>#PRODUCT# is getting super lonely in the warehouse because there's so few left!</p>`,
        adminAlertEmailSubject: "New friend alert! #EMAIL# 🎈",
        adminAlertEmailBody: `<h1>Guess What?</h1><p>#SHOP_NAME# just joined the party! Cheers!</p>`
    },
    {
        name: "Luxe Minimal",
        description: "Ultra-premium, white-label feel with high-fashion aesthetics.",
        thumbnailUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body><div style="padding:60px; font-family: 'Garamond', serif; color:#222; max-width:600px; margin:auto; line-height:1.4;"> <div style="text-align:center; letter-spacing:8px; text-transform:uppercase;">#SHOP_NAME#</div> <div style="margin:60px 0; border-top:0.5px solid #ccc; border-bottom:0.5px solid #ccc; padding:40px 0;">#CONTENT#</div> <div style="font-size:10px; text-align:center; letter-spacing:2px; color:#999;">&copy; #YEAR# COLLECTION</div> </div></body></html>`,
        welcomeEmailSubject: "Introduction to #SHOP_NAME#",
        welcomeEmailBody: `<h1 style="font-weight:lighter; font-size:24px;">Welcome.</h1><p>It is our pleasure to welcome you to the #SHOP_NAME# aesthetic.</p>`,
        newOrderEmailSubject: "Your Selection: Order ##ID#",
        newOrderEmailBody: `<p>We have received your selection ##ID#.</p>#ITEMS#<p>Total consideration: #TOTAL#</p>`,
        lowStockEmailSubject: "Limited Availability: #PRODUCT#",
        lowStockEmailBody: `<p>Please be advised that inventory for #PRODUCT# is reaching final quantities.</p>`,
        adminAlertEmailSubject: "New Registration: #SHOP_NAME#",
        adminAlertEmailBody: `<p>A new entity #SHOP_NAME# has registered on the platform.</p>`
    }
    // (Adding more 6 presets would follow same logic, let's start with these 6 high-quality ones 
    // to ensure they are distinctive and 'premium' as requested, 
    // or I can expand to 12 if you prefer now. I'll do 6 more diverse ones).
];

// Add 6 more to reach 12
const MORE_PRESETS = [
    {
        name: "Retro vibe",
        description: "80s inspired retro aesthetic with neon glow and pixel fonts vibe.",
        thumbnailUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#2d1b4e; color:#ff00ff; font-family: monospace; padding:20px;"><div style="border:4px solid #00ffff; padding:20px;">[ #SHOP_NAME# SYSTEM ]<hr style="border:1px solid #ff00ff;">#CONTENT#</div></body></html>`,
        welcomeEmailSubject: "System Online: Welcome #SHOP_NAME# 🕹️",
        welcomeEmailBody: `<h1>Access Granted!</h1><p>Welcome to the grid, User. #SHOP_NAME# is now yours to control.</p>`,
        newOrderEmailSubject: "New Data Pack: Order ##ID# 💾",
        newOrderEmailBody: `<h1>Transfer Initiated!</h1><p>Order ##ID# is being processed in the mainframe.</p>#ITEMS#`,
        lowStockEmailSubject: "Buffer Underrun: #PRODUCT# ⚠️",
        lowStockEmailBody: `<h1>Critical Warning!</h1><p>Physical resource #PRODUCT# is depleted.</p>`,
        adminAlertEmailSubject: "New Terminal: #EMAIL# ⚡",
        adminAlertEmailBody: `<p>New terminal #SHOP_NAME# detected.</p>`
    },
    {
        name: "Eco Canvas",
        description: "Natural, recycled paper look with organic green tones.",
        thumbnailUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#f4f1ea; font-family: serif; color:#3d3d3d; padding:40px;"><div style="background:#fdfcf9; border:1px solid #e0dcd0; border-radius:4px; padding:40px;">#CONTENT#<div style="border-top:1px solid #e0dcd0; margin-top:20px; font-style:italic;">&copy; #YEAR# #SHOP_NAME# - 100% Digital</div></div></body></html>`,
        welcomeEmailSubject: "Growing Together at #SHOP_NAME# 🌱",
        welcomeEmailBody: `<h1>A Natural Beginning</h1><p>Thanks for joining #SHOP_NAME#. We're glad you're here.</p>`,
        newOrderEmailSubject: "Harvest Confirmed: Order ##ID# 🧺",
        newOrderEmailBody: `<h1>Order Received</h1><p>We've gathered your items for ##ID#.</p>#ITEMS#`,
        lowStockEmailSubject: "Sustainability Alert: #PRODUCT# 🍂",
        lowStockEmailBody: `<p>Available stock of #PRODUCT# is waning.</p>`,
        adminAlertEmailSubject: "New Shop Sown: #SHOP_NAME#",
        adminAlertEmailBody: `<p>#SHOP_NAME# has joined the ecosystem.</p>`
    },
    {
        name: "Indigo Night",
        description: "High-contrast dark mode with deep indigo and electric blue.",
        thumbnailUrl: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#0f172a; color:#f8fafc; font-family:sans-serif; padding:40px;"><div style="background:#1e293b; border-radius:12px; padding:40px; border:1px solid #334155;">#CONTENT#</div></body></html>`,
        welcomeEmailSubject: "The Night is Young: Welcome to #SHOP_NAME# 🌙",
        welcomeEmailBody: `<h1>Welcome!</h1><p>Experience the premium side of #SHOP_NAME#.</p>`,
        newOrderEmailSubject: "Package In Transit: Order ##ID# 🛸",
        newOrderEmailBody: `<h1>Confirmed!</h1><p>Order ##ID# is official.</p>`,
        lowStockEmailSubject: "Signal Warning: #PRODUCT# 📡",
        lowStockEmailBody: `<h1>Low Stock!</h1><p>Inventory for #PRODUCT# is low.</p>`,
        adminAlertEmailSubject: "New Connection: #EMAIL# 🪐",
        adminAlertEmailBody: `<p>New partner #SHOP_NAME# online.</p>`
    },
    {
        name: "Golden Hour",
        description: "Warm amber and gold tones. Luxurious and inviting.",
        thumbnailUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#fffcf0; padding:40px;"><div style="background:white; border-top:10px solid #fbbf24; box-shadow:0 10px 20px rgba(0,0,0,0.05); padding:40px;">#CONTENT#</div></body></html>`,
        welcomeEmailSubject: "A Golden Welcome from #SHOP_NAME# ✨",
        welcomeEmailBody: `<h1>Hello!</h1><p>Enjoy the refined experience at #SHOP_NAME#.</p>`,
        newOrderEmailSubject: "Precious Cargo: Order ##ID# 💎",
        newOrderEmailBody: `<h1>It's Official!</h1><p>Order ##ID# is confirmed.</p>`,
        lowStockEmailSubject: "Inventory Alert: #PRODUCT# 🕰️",
        lowStockEmailBody: `<h1>Almost Gone!</h1><p>Shop #PRODUCT# before it sells out.</p>`,
        adminAlertEmailSubject: "New Spark: #SHOP_NAME#",
        adminAlertEmailBody: `<p>#SHOP_NAME# has registered.</p>`
    },
    {
        name: "Simple Slate",
        description: "Hyper-clean, monochrome, and professional.",
        thumbnailUrl: "https://images.unsplash.com/photo-1454165833767-02a6e0503d21?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#f1f5f9; padding:20px;"><div style="background:white; padding:40px; color:#334155;">#CONTENT#<div style="margin-top:20px; color:#94a3b8; font-size:12px;">#SHOP_NAME# #YEAR#</div></div></body></html>`,
        welcomeEmailSubject: "Welcome to #SHOP_NAME#",
        welcomeEmailBody: `<h1>Welcome</h1><p>Your #SHOP_NAME# account is ready.</p>`,
        newOrderEmailSubject: "Order ##ID# - #SHOP_NAME#",
        newOrderEmailBody: `<h1>Confirmed</h1><p>Order ##ID# received.</p>`,
        lowStockEmailSubject: "Stock Alert: #PRODUCT#",
        lowStockEmailBody: `<h1>Alert</h1><p>#PRODUCT# inventory is low.</p>`,
        adminAlertEmailSubject: "Account Alert: #SHOP_NAME#",
        adminAlertEmailBody: `<p>New registration for #SHOP_NAME#.</p>`
    },
    {
        name: "Velvet Rose",
        description: "Soft pinks and deep burgundies. Perfect for jewelry, beauty, or desserts.",
        thumbnailUrl: "https://images.unsplash.com/photo-1518199266791-73ad7858e805?auto=format&fit=crop&q=80&w=200&h=150",
        globalEmailTemplate: `<!DOCTYPE html><html><body style="background:#fff1f2; padding:40px;"><div style="background:white; border:1px solid #fecdd3; border-radius:20px; padding:40px;">#CONTENT#</div></body></html>`,
        welcomeEmailSubject: "A Sweet Hello from #SHOP_NAME# 🌹",
        welcomeEmailBody: `<h1>Welcome, Love!</h1><p>We're so glad you're here at #SHOP_NAME#.</p>`,
        newOrderEmailSubject: "Tucked & Ready: Order ##ID# 🎁",
        newOrderEmailBody: `<h1>Yay!</h1><p>Order ##ID# is confirmed.</p>`,
        lowStockEmailSubject: "Limited Edition Alert: #PRODUCT# 🥀",
        lowStockEmailBody: `<h1>Few Left!</h1><p>#PRODUCT# is almost out of stock.</p>`,
        adminAlertEmailSubject: "New Boutique: #SHOP_NAME# 🎀",
        adminAlertEmailBody: `<p>#SHOP_NAME# is now on board.</p>`
    }
];

const ALL_PRESETS = [...PRESETS, ...MORE_PRESETS];

async function main() {
    console.log('🚮 Clearing existing presets...');
    await prisma.emailPreset.deleteMany();

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

    console.log('🌱 Seeding 12 premium presets...');
    for (const preset of ALL_PRESETS) {
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
