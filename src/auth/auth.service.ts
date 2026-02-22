import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { SystemConfigService } from '../superadmin/system-config.service';
import axios from 'axios';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private db: DatabaseService,
        private emailService: EmailService,
        private systemConfigService: SystemConfigService,
    ) { }

    async signIn(email: string, pass: string): Promise<{ access_token: string }> {
        console.log(`[AUTH] Step 1: Login attempt for email: ${email}`);

        const user = await this.db.user.findUnique({
            where: { email },
            include: { shop: true },
        });

        console.log(
            `[AUTH] Step 2: User lookup result:`,
            user
                ? {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    shopId: user.shopId,
                }
                : 'User not found',
        );

        if (!user) {
            console.log(`[AUTH] Step 3: LOGIN FAILED - User not found`);
            throw new UnauthorizedException('Invalid credentials');
        }

        const isMatch = await bcrypt.compare(pass, user.password);
        console.log(
            `[AUTH] Step 4: Password validation:`,
            isMatch ? 'SUCCESS' : 'FAILED',
        );

        if (!isMatch) {
            console.log(`[AUTH] Step 5: LOGIN FAILED - Invalid password`);
            throw new UnauthorizedException('Invalid credentials');
        }

        // Add proper flags to payload
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            subscriptionEndsAt: user.shop?.subscriptionEndsAt,
            plan: user.role === 'SUPERADMIN' ? 'PRO' : user.shop?.plan || 'FREE', // Single Source of Truth

            onboardingCompleted: user.onboardingCompleted,
            hasSeenTour: user.hasSeenTour,
            isActive: user.isActive,
            shopIsActive: user.shop?.isActive ?? true,
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

        // Create User + Shop
        const user = await this.db.$transaction(async (tx: any) => {
            const shop = await tx.shop.create({
                data: {
                    name: shopName,
                    email: email, // use user email as shop email default
                    plan: 'FREE',
                    isActive: true,
                    brandColor: '#F59E0B', // Default amber/gold
                },
            });

            return await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    role: 'ADMIN',
                    shopId: shop.id,
                    trialEndsAt: null, // No trial until onboarding plan selection
                    onboardingCompleted: false, // Must complete onboarding
                },
            });
        });

        return this.signIn(email, pass);
    }

    async completeOnboarding(userId: string, data: any) {
        console.log(`[AUTH] Completing onboarding for user ${userId}`);

        // 1. Update User
        await this.db.user.update({
            where: { id: userId },
            data: { onboardingCompleted: true },
        });

        // 2. Get User's Shop ID
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user || !user.shopId) throw new Error('User or Shop not found');

        // 3. Update Shop Details & Plan
        const selectedPlan = 'PRO_TRIAL';

        // Fetch trial days from Global Config
        const config = await this.systemConfigService.getConfig();
        const trialDays = config.trialDays || 3;

        const date = new Date();
        date.setDate(date.getDate() + trialDays);
        const trialEndsAt = date;

        // Update User & Shop

        await this.db.user.update({
            where: { id: userId },
            data: {
                onboardingCompleted: true,
                trialEndsAt: trialEndsAt,
            },
        });

        await this.db.shop.update({
            where: { id: user.shopId },
            data: {
                name: data.shopName,
                ownerName: data.ownerName,
                plan: selectedPlan as any, // Update Shop Plan
                brandColor: data.brandColor || '#6366F1', // Fix Color Hex Bug

                logoUrl: data.logoUrl,
                socialLinks: {
                    facebook: data.facebookUrl,
                    instagram: data.instagramUrl,
                    website: data.websiteUrl,
                },
                platformIds: data.pageId ? { facebook: data.pageId } : undefined,
                accessToken: data.pageAccessToken,
                minOrderValue: data.minOrderValue,
                deliveryCharge: data.deliveryChargeInside,
                aiConfig: {
                    deliveryChargeInside: data.deliveryChargeInside,
                    deliveryChargeOutside: data.deliveryChargeOutside,
                    confirmationTemplate: data.confirmationTemplate,
                },
                confirmationTemplate: data.confirmationTemplate,
                ...(data.pageId && { platformIds: { facebook: data.pageId } }),
                ...(data.pageAccessToken && { accessToken: data.pageAccessToken }),
            },
        });

        // 4. Generate new token with updated claims
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: trialEndsAt, // Updated Value
            subscriptionEndsAt: null, // New Trial
            plan: selectedPlan, // Standardized key
            onboardingCompleted: true,
            hasSeenTour: false,
        };

        const token = await this.jwtService.signAsync(payload);

        return {
            success: true,
            access_token: token,
        };
    }

    async forgotPassword(email: string) {
        const user = await this.db.user.findUnique({ where: { email } });
        if (!user) {
            // Don't reveal user existence
            return { message: 'If this email exists, a reset link has been sent.' };
        }

        // Generate a reset token (using JWT for simplicity, though dedicated token is better for single-use)
        // We'll use a short-lived JWT (1 hour)
        const payload = { sub: user.id, type: 'password-reset' };
        const token = await this.jwtService.signAsync(payload, { expiresIn: '1h' });

        // Send email
        await this.emailService.sendResetPasswordEmail(email, token);

        return { message: 'If this email exists, a reset link has been sent.' };
    }

    async resetPassword(token: string, newPass: string) {
        try {
            const payload = await this.jwtService.verifyAsync(token);
            if (payload.type !== 'password-reset') {
                throw new UnauthorizedException('Invalid token type');
            }

            const userId = payload.sub;
            const hashedPassword = await bcrypt.hash(newPass, 10);

            await this.db.user.update({
                where: { id: userId },
                data: { password: hashedPassword },
            });

            return { message: 'Password reset successfully' };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    async impersonate(userId: string) {
        const user = await this.db.user.findUnique({
            where: { id: userId },
            include: { shop: true },
        });
        if (!user) throw new Error('User not found');

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            plan: user.shop?.plan || 'FREE',
            subscriptionEndsAt: user.shop?.subscriptionEndsAt,
            onboardingCompleted: user.onboardingCompleted,
            hasSeenTour: user.hasSeenTour,
            isImpersonated: true, // Flag to track this session
        };

        const token = await this.jwtService.signAsync(payload);
        return { access_token: token, user };
    }

    async facebookAuth(accessToken: string): Promise<{ access_token: string }> {
        console.log(
            `[AUTH] Facebook SSO Attempt with token length: ${accessToken?.length}`,
        );

        try {
            // 1. Verify token with Facebook Graph API
            const fbResponse = await axios.get(
                `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${accessToken}`,
            );
            const { id: facebookId, name: fbName, email: fbEmail } = fbResponse.data;
            const name = fbName || 'ShopSync User';
            const email = fbEmail;

            if (!facebookId) {
                throw new UnauthorizedException('Invalid Facebook token');
            }

            console.log(
                `[AUTH] Facebook verified: ${name} (${email || 'No email'}) [${facebookId}]`,
            );

            // 2. Find user by facebookId or email
            let user = await this.db.user.findFirst({
                where: {
                    OR: [
                        { facebookId: facebookId },
                        { email: email || 'never-match-this-random-string' },
                    ],
                },
                include: { shop: true },
            });

            // 3. If not found, create new user + shop
            if (!user) {
                console.log(
                    `[AUTH] User not found. Creating new user for Facebook ID: ${facebookId}`,
                );

                // If we don't have an email from FB, we might need to handle this.
                // However, most FB accounts have emails. If not, use generated one.
                const finalEmail = email || `${facebookId}@facebook.com`;

                user = await this.db.$transaction(async (tx: any) => {
                    const shop = await tx.shop.create({
                        data: {
                            name: name.includes('User') ? `${name}` : `${name}'s Shop`,
                            email: finalEmail,
                            plan: 'FREE',
                            isActive: true,
                            brandColor: '#F59E0B',
                        },
                    });

                    return await tx.user.create({
                        data: {
                            email: finalEmail,
                            password: await bcrypt.hash(Math.random().toString(36), 10), // Random pass for SSO users
                            role: 'ADMIN',
                            shopId: shop.id,
                            facebookId: facebookId,
                            onboardingCompleted: false,
                        },
                        include: { shop: true },
                    });
                });
            } else if (!user.facebookId) {
                // Link official FB ID to existing email account if not linked
                await this.db.user.update({
                    where: { id: user.id },
                    data: { facebookId: facebookId },
                });
            }

            // Final check to satisfy TypeScript
            if (!user) {
                throw new UnauthorizedException(
                    'User account could not be identified or created',
                );
            }

            // 4. Generate JWT
            const payload = {
                sub: user.id,
                email: user.email,
                role: user.role,
                shopId: user.shopId,
                trialEndsAt: user.trialEndsAt,
                subscriptionEndsAt: (user as any).shop?.subscriptionEndsAt,
                plan:
                    user.role === 'SUPERADMIN'
                        ? 'PRO'
                        : (user as any).shop?.plan || 'FREE',
                onboardingCompleted: user.onboardingCompleted,
                hasSeenTour: user.hasSeenTour,
                isActive: user.isActive,
                shopIsActive: (user as any).shop?.isActive ?? true,
            };

            const token = await this.jwtService.signAsync(payload);
            return { access_token: token };
        } catch (error) {
            console.error(
                '[AUTH] Facebook SSO Error:',
                error.response?.data || error.message,
            );
            throw new UnauthorizedException('Facebook authentication failed');
        }
    }
    async markTourAsSeen(userId: string) {
        await this.db.user.update({
            where: { id: userId },
            data: { hasSeenTour: true },
        });
        return { success: true };
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedException('User not found');

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) throw new BadRequestException('Current password is incorrect');

        if (newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters');

        const hashed = await bcrypt.hash(newPassword, 10);
        await this.db.user.update({ where: { id: userId }, data: { password: hashed } });
        return { success: true, message: 'Password updated successfully' };
    }

    async updateProfile(userId: string, data: { name?: string; phone?: string }) {
        const user = await this.db.user.findUnique({ where: { id: userId }, include: { shop: true } });
        if (!user) throw new UnauthorizedException('User not found');

        // Update the shop's ownerName/phone if the user is an ADMIN
        if (user.shopId) {
            await this.db.shop.update({
                where: { id: user.shopId },
                data: {
                    ...(data.name !== undefined && { ownerName: data.name }),
                    ...(data.phone !== undefined && { phone: data.phone }),
                },
            });
        }
        return { success: true, message: 'Profile updated successfully' };
    }
}
