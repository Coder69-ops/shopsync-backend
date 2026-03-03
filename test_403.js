const axios = require('axios');

async function test() {
    try {
        const loginRes = await axios.post('http://localhost:3002/auth/login', {
            email: 'superadmin@shopsync.it.com',
            password: 'admin123'
        });

        const token = loginRes.data.access_token;
        console.log("Got token:", token.substring(0, 20) + "...");

        const statsRes = await axios.get('http://localhost:3002/payments/admin/stats', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log("Success!", statsRes.data);
    } catch (e) {
        console.error("Error:", e.response?.status, e.response?.data);
    }
}

test();
