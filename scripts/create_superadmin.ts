
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'superadmin@shopsync.com';
    const password = 'SuperAdmin123!';
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        console.log(`User ${email} already exists.`);
        // Optional: Update role if needed
        if (existingUser.role !== 'SUPERADMIN') {
            console.log(`Updating role to SUPERADMIN...`);
            await prisma.user.update({
                where: { id: existingUser.id },
                data: { role: 'SUPERADMIN' }
            });
            console.log(`Role updated.`);
        }
        return;
    }

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            role: 'SUPERADMIN',
            onboardingCompleted: true,
            shopId: null, // No shop for superadmin
        },
    });


    console.log(`
  ✅ Super Admin Created Successfully!
  ------------------------------------
  Email:    ${email}
  Password: ${password}
  Role:     SUPERADMIN
  ------------------------------------
  You can now login at /login
  `);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
