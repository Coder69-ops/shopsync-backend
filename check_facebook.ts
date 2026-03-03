import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const pageId = '712736731918802';

async function main() {
    // This is a test script, we will just find the first shop since pageId doesn't exist
    const shop = await prisma.shop.findFirst();
    if (!shop) {
        console.log('❌ Shop not found');
        return;
    }

    const token = shop.accessToken;
    console.log('Checking token for Page:', shop.name);

    try {
        // 1. Check Token Debug Info
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
        const debugRes = await axios.get(debugUrl);
        console.log('✅ Token Scopes:', debugRes.data.data.scopes);
        console.log('✅ Token Expires at:', new Date(debugRes.data.data.data_access_expires_at * 1000));
    } catch (e: any) {
        console.log('❌ Debug Token failed:', e.response?.data || e.message);
    }

    try {
        // 2. Test "me" endpoint
        const meUrl = `https://graph.facebook.com/v19.0/me?access_token=${token}`;
        const meRes = await axios.get(meUrl);
        console.log('✅ /me response:', meRes.data);
    } catch (e: any) {
        console.log('❌ /me failed:', e.response?.data || e.message);
    }

    try {
        // 3. Test sending a test message to the user who just messaged (id from logs)
        const testRecipient = '25659669957067516';
        const msgUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`;
        console.log('Attempting to send test message to:', testRecipient);
        const msgRes = await axios.post(msgUrl, {
            recipient: { id: testRecipient },
            message: { text: 'Test from ShopSync Backend Diagnostics' },
            messaging_type: 'RESPONSE'
        });
        console.log('✅ Test message SENT:', msgRes.data);
    } catch (e: any) {
        console.log('❌ Test message FAILED:', e.response?.data || e.message);

        // 4. Try with Page ID instead of "me"
        try {
            console.log('Attempting with Page ID instead of "me"...');
            const pageMsgUrl = `https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${token}`;
            const pageMsgRes = await axios.post(pageMsgUrl, {
                recipient: { id: '25659669957067516' },
                message: { text: 'Test from ShopSync (Page ID Endpoint)' },
                messaging_type: 'RESPONSE'
            });
            console.log('✅ Page ID message SENT:', pageMsgRes.data);
        } catch (e2: any) {
            console.log('❌ Page ID message FAILED:', e2.response?.data || e2.message);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
