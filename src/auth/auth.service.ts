import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../email/email.service';
import { SystemConfigService } from '../superadmin/system-config.service';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private db: DatabaseService,
        private emailService: EmailService,
        private systemConfigService: SystemConfigService,
        @InjectQueue('facebook-capi') private readonly fbCapiQueue: Queue,
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

        if (!user.isEmailVerified && user.role !== 'SUPERADMIN') {
            console.log(`[AUTH] Step 5.5: LOGIN FAILED - Email not verified`);
            throw new UnauthorizedException({
                message: 'EMAIL_NOT_VERIFIED',
                code: 'EMAIL_NOT_VERIFIED'
            });
        }

        // Add proper flags to payload
        const payload = {
            sub: user.id,
            email: user.email,
            profilePic: (user as any).profilePic,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            subscriptionEndsAt: user.shop?.subscriptionEndsAt,
            plan: user.role === 'SUPERADMIN' ? 'PRO' : user.shop?.plan || 'FREE', // Single Source of Truth

            onboardingCompleted: user.onboardingCompleted,
            hasSeenTour: user.hasSeenTour,
            isActive: user.isActive,
            shopIsActive: user.shop?.isActive ?? true,
            themePreference: (user as any).themePreference,
            languagePreference: (user as any).languagePreference,
            emailNotifications: (user as any).emailNotifications,
        };

        console.log(`[AUTH] Step 6: JWT Payload created:`, payload);

        const token = await this.jwtService.signAsync(payload);
        console.log(`[AUTH] Step 7: JWT Token generated successfully`);
        console.log(`[AUTH] Step 8: LOGIN SUCCESS for ${email}`);

        return {
            access_token: token,
        };
    }

    async signUp(email: string, pass: string, shopName?: string, reqDetails?: any): Promise<any> {
        // Check if user exists
        const existing = await this.db.user.findUnique({ where: { email } });
        if (existing) throw new UnauthorizedException('User already exists');

        const hashedPassword = await bcrypt.hash(pass, 10);
        const verificationToken = uuidv4();
        const verificationTokenExpires = new Date();
        verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

        const defaultShopName = shopName || `${email.split('@')[0]}'s Shop`;

        // Create User + Shop
        const user = await this.db.$transaction(async (tx: any) => {
            const shop = await tx.shop.create({
                data: {
                    name: defaultShopName,
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
                    isEmailVerified: false,
                    verificationToken,
                    verificationTokenExpires,
                },
            });
        });

        // Send verification email
        await this.emailService.sendVerificationEmail(email, verificationToken);

        // Add Facebook CAPI Event to BullMQ Queue asynchronously
        if (reqDetails && this.fbCapiQueue) {
            this.fbCapiQueue.add('send-start-trial', {
                userData: {
                    email: email,
                    firstName: reqDetails.firstName,
                    lastName: reqDetails.lastName,
                    phone: reqDetails.phone
                },
                reqParams: {
                    clientIp: reqDetails.ip,
                    userAgent: reqDetails.userAgent
                }
            }).catch(err => console.error('[AUTH] Failed to queue FB CAPI StartTrial:', err));
        }

        return {
            message: 'Registration successful. Please check your email to verify your account.',
            email: user.email,
        };
    }

    async verifyEmail(token: string) {
        const user = await this.db.user.findFirst({
            where: {
                verificationToken: token,
                verificationTokenExpires: { gt: new Date() },
            },
        });

        if (!user) {
            throw new BadRequestException('Invalid or expired verification token');
        }

        await this.db.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                verificationToken: null,
                verificationTokenExpires: null,
            },
        });

        return { message: 'Email verified successfully. You can now log in.' };
    }

    async resendVerificationEmail(email: string) {
        const user = await this.db.user.findUnique({ where: { email } });
        if (!user) throw new NotFoundException('User not found');
        if (user.isEmailVerified) throw new BadRequestException('Email is already verified');

        const verificationToken = uuidv4();
        const verificationTokenExpires = new Date();
        verificationTokenExpires.setHours(verificationTokenExpires.getHours() + 24);

        await this.db.user.update({
            where: { id: user.id },
            data: {
                verificationToken,
                verificationTokenExpires,
            },
        });

        await this.emailService.sendVerificationEmail(email, verificationToken);

        return { message: 'Verification email resent successfully.' };
    }

    async completeOnboarding(userId: string, data: any) {
        console.log(`[AUTH] Completing onboarding for user ${userId}`);

        // Initial update to lock the state (optional but keeping for consistency if needed)
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

        if (data.pageId) {
            const trimmedPageId = String(data.pageId).trim();
            const existingShopWithPage = await this.db.shop.findFirst({
                where: {
                    id: { not: user.shopId },
                    platformIds: {
                        path: ['facebook'],
                        equals: trimmedPageId,
                    },
                },
            });

            if (existingShopWithPage) {
                throw new BadRequestException('This Facebook page is already connected to another ShopSync account.');
            }
            data.pageId = trimmedPageId;
        }

        // Update User & Shop

        await this.db.user.update({
            where: { id: userId },
            data: {
                onboardingCompleted: true,
                trialEndsAt: trialEndsAt,
            },
        });

        const updatedShop = await this.db.shop.update({
            where: { id: user.shopId },
            data: {
                name: data.shopName,
                ownerName: data.ownerName,
                plan: selectedPlan as any, // Update Shop Plan
                trialEndsAt: trialEndsAt, // Sync trial date to shop
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

                // Localization Defaults
                currencySymbol: '৳',
                currencyCode: 'BDT',
                timezone: 'Asia/Dhaka',
                dateFormat: 'dd/MM/yyyy',

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

        // 4. Send Welcome Emails
        try {
            await this.emailService.sendWelcomeMerchant(user.email, updatedShop.name);
            await this.emailService.sendNewShopSignupAlert({
                id: updatedShop.id,
                name: updatedShop.name,
                ownerName: updatedShop.ownerName,
                email: user.email,
                pageId: data.pageId
            });
        } catch (emailError) {
            console.error('[AUTH] Failed to send welcome emails:', emailError);
            // Don't block onboarding if email fails
        }

        // 5. Generate new token with updated claims
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

        // Remove password before returning
        const { password, ...safeUser } = user;

        return { access_token: token, user: safeUser };
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
                profilePic: user.profilePic,
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
                themePreference: (user as any).themePreference,
                languagePreference: (user as any).languagePreference,
                emailNotifications: (user as any).emailNotifications,
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

    async updateProfile(userId: string, data: { name?: string; phone?: string; profilePic?: string }) {
        const user = await this.db.user.findUnique({ where: { id: userId }, include: { shop: true } });
        if (!user) throw new UnauthorizedException('User not found');

        // Update User Model (Personal info)
        if (data.profilePic !== undefined) {
            await this.db.user.update({
                where: { id: userId },
                data: { profilePic: data.profilePic } as any,
            });
        }

        // Update Shop Model (Business contact info)
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

    async updatePreferences(userId: string, data: { themePreference?: string; languagePreference?: string; emailNotifications?: boolean }) {
        const user = await this.db.user.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedException('User not found');

        const updateData: any = {};
        if (data.themePreference !== undefined) updateData.themePreference = data.themePreference;
        if (data.languagePreference !== undefined) updateData.languagePreference = data.languagePreference;
        if (data.emailNotifications !== undefined) updateData.emailNotifications = data.emailNotifications;

        await this.db.user.update({
            where: { id: userId },
            data: updateData,
        });

        return { success: true, message: 'Preferences updated successfully', data: updateData };
    }

    async getProfile(userId: string) {
        const user = await this.db.user.findUnique({
            where: { id: userId },
            include: { shop: true },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            profilePic: (user as any).profilePic,
            role: user.role,
            shopId: user.shopId,
            trialEndsAt: user.trialEndsAt,
            subscriptionEndsAt: user.shop?.subscriptionEndsAt,
            plan: user.role === 'SUPERADMIN' ? 'PRO' : user.shop?.plan || 'FREE',
            onboardingCompleted: user.onboardingCompleted,
            hasSeenTour: user.hasSeenTour,
            isActive: user.isActive,
            shopIsActive: user.shop?.isActive ?? true,
            themePreference: (user as any).themePreference,
            languagePreference: (user as any).languagePreference,
            emailNotifications: (user as any).emailNotifications,
        };

        const token = await this.jwtService.signAsync(payload);

        // Remove password before returning
        const { password, ...safeUser } = user;

        return { access_token: token, user: safeUser };
    }
}
