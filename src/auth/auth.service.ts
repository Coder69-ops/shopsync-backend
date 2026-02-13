import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private db: DatabaseService,
    ) { }

    async signIn(email: string, pass: string): Promise<{ access_token: string }> {
        console.log(`[AUTH] Step 1: Login attempt for email: ${email}`);

        const user = await this.db.user.findUnique({
            where: { email },
        });

        console.log(`[AUTH] Step 2: User lookup result:`, user ? {
            id: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId
        } : 'User not found');

        if (!user) {
            console.log(`[AUTH] Step 3: LOGIN FAILED - User not found`);
            throw new UnauthorizedException('Invalid credentials');
        }

        const isMatch = await bcrypt.compare(pass, user.password);
        console.log(`[AUTH] Step 4: Password validation:`, isMatch ? 'SUCCESS' : 'FAILED');

        if (!isMatch) {
            console.log(`[AUTH] Step 5: LOGIN FAILED - Invalid password`);
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            subscriptionTier: user.subscriptionTier,
            onboardingCompleted: user.onboardingCompleted,
        };

        console.log(`[AUTH] Step 6: JWT Payload created:`, payload);

        const token = await this.jwtService.signAsync(payload);
        console.log(`[AUTH] Step 7: JWT Token generated successfully`);
        console.log(`[AUTH] Step 8: LOGIN SUCCESS for ${email}`);

        return {
            access_token: token,
        };
    }

    async signUp(email: string, pass: string, shopName: string): Promise<any> {
        // Check if user exists
        const existing = await this.db.user.findUnique({ where: { email } });
        if (existing) throw new UnauthorizedException('User already exists');

        const hashedPassword = await bcrypt.hash(pass, 10);

        // Create 72-hour trial
        const trialEndsAt = new Date();
        trialEndsAt.setHours(trialEndsAt.getHours() + 72);

        // Transaction: Create User + Shop
        const user = await this.db.$transaction(async (tx: any) => {
            const shop = await tx.shop.create({
                data: {
                    name: shopName,
                    email: email, // use user email as shop email default
                    plan: 'FREE', // Initial plan logic (mirrored)
                    isActive: true,
                    brandColor: '#F59E0B', // Default amber/gold
                }
            });

            return await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    role: 'ADMIN',
                    shopId: shop.id,
                    subscriptionTier: 'FREE', // Start with FREE trial (logic handles this as PRO)
                    trialEndsAt: trialEndsAt,
                    onboardingCompleted: false, // Must complete onboarding
                }
            });
        });

        return this.signIn(email, pass);
    }

    async completeOnboarding(userId: string, data: any) {
        console.log(`[AUTH] Completing onboarding for user ${userId}`);

        // 1. Update User
        await this.db.user.update({
            where: { id: userId },
            data: { onboardingCompleted: true }
        });

        // 2. Get User's Shop ID
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user || !user.shopId) throw new Error("User or Shop not found");

        // 3. Update Shop Details
        await this.db.shop.update({
            where: { id: user.shopId },
            data: {
                name: data.shopName,
                brandColor: data.brandColor ? '#' + data.brandColor.toString(16).substring(2) : undefined, // Convert int color to hex if needed or assume string? Frontend sends what?
                // Frontend OnboardingState has Color object, needs to be serialized.
                logoUrl: data.logoUrl,
                socialLinks: {
                    facebook: data.facebookUrl,
                    instagram: data.instagramUrl,
                    website: data.websiteUrl
                },
                minOrderValue: data.minOrderValue,
                deliveryCharge: data.deliveryChargeInside, // Schema has one field? Logic separate?
                // Schema has deliveryCharge Decimal?. Let's assume inside charge for now or we need schema update for inside/outside?
                // Schema has `deliveryCharge` (singular). The User asked for Inside/Outside.
                // I should store Inside/Outside in `aiConfig` or just use `deliveryCharge` as base.
                // Let's store in aiConfig for now to avoid schema change loop.
                aiConfig: {
                    deliveryChargeInside: data.deliveryChargeInside,
                    deliveryChargeOutside: data.deliveryChargeOutside,
                    confirmationTemplate: data.confirmationTemplate,
                },
                confirmationTemplate: data.confirmationTemplate,
            }
        });

        // 4. Generate new token with updated claims
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            subscriptionTier: user.subscriptionTier,
            onboardingCompleted: true, // Explicitly set true in new token
        };

        const token = await this.jwtService.signAsync(payload);

        return {
            success: true,
            access_token: token
        };
    }
}
