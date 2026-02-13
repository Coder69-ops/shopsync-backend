import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ShopService {
    constructor(private db: DatabaseService) { }

    async create(createShopDto: CreateShopDto) {
        // Check if pageId already exists
        const existingShop = await this.db.shop.findFirst({
            where: { pageId: createShopDto.pageId },
        });

        if (existingShop) {
            throw new ConflictException('A shop with this Facebook Page ID already exists');
        }

        // Check if admin email already exists
        const existingUser = await this.db.user.findUnique({
            where: { email: createShopDto.adminEmail },
        });

        if (existingUser) {
            throw new ConflictException('A user with this email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(createShopDto.adminPassword, 10);

        // Create shop and admin user in a transaction
        const shop = await this.db.shop.create({
            data: {
                id: crypto.randomUUID(),
                name: createShopDto.name,
                email: createShopDto.adminEmail, // Use adminEmail as shop email
                pageId: createShopDto.pageId,
                accessToken: createShopDto.accessToken,
                plan: createShopDto.plan,
                users: {
                    create: {
                        id: crypto.randomUUID(),
                        email: createShopDto.adminEmail,
                        password: hashedPassword,
                        role: 'ADMIN', // Hardcoded as matching enum string
                    },
                },
            },
            include: {
                users: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });

        return shop;
    }

    async findAll() {
        return this.db.shop.findMany({
            include: {
                _count: {
                    select: {
                        orders: true,
                        products: true,
                        users: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findOne(id: string) {
        const shop = await this.db.shop.findUnique({
            where: { id },
            include: {
                users: {
                    select: {
                        id: true,
                        email: true,
                        role: true,
                        createdAt: true,
                    },
                },
                _count: {
                    select: {
                        orders: true,
                        products: true,
                        conversations: true,
                    },
                },
            },
        });

        if (!shop) {
            throw new NotFoundException('Shop not found');
        }

        return shop;
    }

    async update(id: string, updateShopDto: UpdateShopDto) {
        // Check if shop exists
        const shop = await this.findOne(id);

        // Handle owner credential updates (Superadmin only)
        if (updateShopDto.ownerEmail || updateShopDto.ownerPassword) {
            //Find the admin user for this shop
            const adminUser = await this.db.user.findFirst({
                where: {
                    shopId: id,
                    role: 'ADMIN',
                },
            });

            if (!adminUser) {
                throw new NotFoundException('Shop admin user not found');
            }

            const userUpdateData: any = {};

            if (updateShopDto.ownerEmail) {
                // Check if new email is already in use
                const existingUser = await this.db.user.findUnique({
                    where: { email: updateShopDto.ownerEmail },
                });

                if (existingUser && existingUser.id !== adminUser.id) {
                    throw new ConflictException('Email already in use');
                }

                userUpdateData.email = updateShopDto.ownerEmail;
            }

            if (updateShopDto.ownerPassword) {
                // Hash the new password
                userUpdateData.password = await bcrypt.hash(updateShopDto.ownerPassword, 10);
            }

            // Update the admin user
            await this.db.user.update({
                where: { id: adminUser.id },
                data: userUpdateData,
            });
        }

        // Update shop details
        return this.db.shop.update({
            where: { id },
            data: {
                ...(updateShopDto.name && { name: updateShopDto.name }),
                ...(updateShopDto.accessToken && { accessToken: updateShopDto.accessToken }),
                ...(updateShopDto.pageId && { pageId: updateShopDto.pageId }),
                ...(updateShopDto.plan && { plan: updateShopDto.plan }),
                ...(typeof updateShopDto.isActive === 'boolean' && { isActive: updateShopDto.isActive }),

                // AI Config & Delivery
                ...(updateShopDto.deliveryCharge !== undefined && { deliveryCharge: updateShopDto.deliveryCharge }),
                ...(updateShopDto.minOrderValue !== undefined && { minOrderValue: updateShopDto.minOrderValue }),
                ...(updateShopDto.confirmationTemplate && { confirmationTemplate: updateShopDto.confirmationTemplate }),
                ...(updateShopDto.aiConfig && { aiConfig: updateShopDto.aiConfig }),

                // Store Config
                ...(updateShopDto.currencySymbol && { currencySymbol: updateShopDto.currencySymbol }),
                ...(updateShopDto.currencyCode && { currencyCode: updateShopDto.currencyCode }),
                ...(updateShopDto.taxRate !== undefined && { taxRate: updateShopDto.taxRate }),
                ...(updateShopDto.timezone && { timezone: updateShopDto.timezone }),
                ...(updateShopDto.dateFormat && { dateFormat: updateShopDto.dateFormat }),

                // Branding
                ...(updateShopDto.logoUrl !== undefined && { logoUrl: updateShopDto.logoUrl }),
                ...(updateShopDto.brandColor !== undefined && { brandColor: updateShopDto.brandColor }),

                // Business Details
                ...(updateShopDto.address !== undefined && { address: updateShopDto.address }),
                ...(updateShopDto.phone !== undefined && { phone: updateShopDto.phone }),
                ...(updateShopDto.emailSupport !== undefined && { emailSupport: updateShopDto.emailSupport }),
                ...(updateShopDto.website !== undefined && { website: updateShopDto.website }),
                ...(updateShopDto.socialLinks !== undefined && { socialLinks: updateShopDto.socialLinks }),

                // Legal
                ...(updateShopDto.vatNumber !== undefined && { vatNumber: updateShopDto.vatNumber }),
                ...(updateShopDto.termsUrl !== undefined && { termsUrl: updateShopDto.termsUrl }),
                ...(updateShopDto.privacyUrl !== undefined && { privacyUrl: updateShopDto.privacyUrl }),
            },
        });
    }

    async remove(id: string) {
        // Check if shop exists
        await this.findOne(id);

        // Soft delete by setting isActive to false
        return this.db.shop.update({
            where: { id },
            data: { isActive: false },
        });
    }
}
