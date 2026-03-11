import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class ShopService {
  constructor(private db: DatabaseService) { }

  async create(createShopDto: CreateShopDto) {
    // Check if pageId already exists in facebook platform
    const existingShop = await this.db.shop.findFirst({
      where: {
        platformIds: {
          path: ['facebook'],
          equals: createShopDto.pageId,
        },
      },
    });

    if (existingShop) {
      throw new ConflictException(
        'A shop with this Facebook Page ID already exists',
      );
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
        platformIds: { facebook: createShopDto.pageId },
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

    return {
      ...shop,
      deliveryCharge: shop.deliveryCharge ? Number(shop.deliveryCharge) : null,
      minOrderValue: shop.minOrderValue ? Number(shop.minOrderValue) : null,
      taxRate: shop.taxRate ? Number(shop.taxRate) : 0,
      pageId: (shop.platformIds as any)?.facebook || null,
    };
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
        userUpdateData.password = await bcrypt.hash(
          updateShopDto.ownerPassword,
          10,
        );
      }

      // Update the admin user
      await this.db.user.update({
        where: { id: adminUser.id },
        data: userUpdateData,
      });
    }

    // Check for unique Page ID if being updated
    if (updateShopDto.pageId) {
      const existingShop = await this.db.shop.findFirst({
        where: {
          platformIds: {
            path: ['facebook'],
            equals: updateShopDto.pageId,
          },
          id: { not: id }, // Exclude current shop
        },
      });

      if (existingShop) {
        throw new ConflictException(
          'This Facebook Page ID is already connected to another shop.',
        );
      }
    }

    // Update shop details
    // Cast to `any` because redxToken/redxStoreId are new schema fields
    // and won't appear in Prisma generated types until `prisma generate` runs.
    const updatedShop = await (this.db.shop as any).update({
      where: { id },
      data: {
        ...(updateShopDto.name && { name: updateShopDto.name }),
        ...(updateShopDto.accessToken && {
          accessToken: updateShopDto.accessToken,
        }),
        ...(updateShopDto.pageId && {
          platformIds: { facebook: updateShopDto.pageId },
        }),
        ...(updateShopDto.plan && { plan: updateShopDto.plan }),
        ...(typeof updateShopDto.isActive === 'boolean' && {
          isActive: updateShopDto.isActive,
        }),

        // AI Config & Delivery
        ...(updateShopDto.deliveryCharge !== undefined && {
          deliveryCharge: updateShopDto.deliveryCharge,
        }),
        // Sync top-level deliveryCharge with aiConfig nested value if present
        ...(updateShopDto.aiConfig?.deliveryChargeInside !== undefined && {
          deliveryCharge: updateShopDto.aiConfig.deliveryChargeInside,
        }),
        ...(updateShopDto.minOrderValue !== undefined && {
          minOrderValue: updateShopDto.minOrderValue,
        }),
        ...(updateShopDto.confirmationTemplate && {
          confirmationTemplate: updateShopDto.confirmationTemplate,
        }),
        ...(updateShopDto.aiConfig && { aiConfig: updateShopDto.aiConfig }),

        // Store Config
        ...(updateShopDto.currencySymbol && {
          currencySymbol: updateShopDto.currencySymbol,
        }),
        ...(updateShopDto.currencyCode && {
          currencyCode: updateShopDto.currencyCode,
        }),
        ...(updateShopDto.taxRate !== undefined && {
          taxRate: updateShopDto.taxRate,
        }),
        ...(updateShopDto.timezone && { timezone: updateShopDto.timezone }),
        ...(updateShopDto.dateFormat && {
          dateFormat: updateShopDto.dateFormat,
        }),

        // Branding
        ...(updateShopDto.logoUrl !== undefined && {
          logoUrl: updateShopDto.logoUrl,
        }),
        ...(updateShopDto.brandColor !== undefined && {
          brandColor: updateShopDto.brandColor,
        }),

        // Business Details
        ...(updateShopDto.address !== undefined && {
          address: updateShopDto.address,
        }),
        ...(updateShopDto.phone !== undefined && {
          phone: updateShopDto.phone,
        }),
        ...(updateShopDto.emailSupport !== undefined && {
          emailSupport: updateShopDto.emailSupport,
        }),
        ...(updateShopDto.website !== undefined && {
          website: updateShopDto.website,
        }),
        ...(updateShopDto.socialLinks !== undefined && {
          socialLinks: updateShopDto.socialLinks,
        }),

        // Legal
        ...(updateShopDto.vatNumber !== undefined && {
          vatNumber: updateShopDto.vatNumber,
        }),
        ...(updateShopDto.termsUrl !== undefined && {
          termsUrl: updateShopDto.termsUrl,
        }),
        ...(updateShopDto.privacyUrl !== undefined && {
          privacyUrl: updateShopDto.privacyUrl,
        }),

        // Courier Integration
        ...(updateShopDto.courierProvider !== undefined && {
          courierProvider: updateShopDto.courierProvider,
        }),
        ...(updateShopDto.courierApiKey !== undefined && {
          courierApiKey: updateShopDto.courierApiKey,
        }),
        ...(updateShopDto.courierSecretKey !== undefined && {
          courierSecretKey: updateShopDto.courierSecretKey,
        }),

        // RedX Integration
        ...(updateShopDto.redxToken !== undefined && {
          redxToken: updateShopDto.redxToken,
        }),
        ...(updateShopDto.redxStoreId !== undefined && {
          redxStoreId: updateShopDto.redxStoreId,
        }),
      },
    });

    return {
      ...updatedShop,
      pageId: (updatedShop.platformIds as any)?.facebook || null,
    };
  }

  async remove(id: string) {
    // Check if shop exists
    await this.findOne(id);

    // Instead of immediate deletion, schedule it for 7 days
    return (this.db.shop as any).update({
      where: { id },
      data: {
        isDeletionScheduled: true,
        deletionScheduledAt: new Date(),
      },
    });
  }

  async permanentlyDelete(id: string) {
    // Hard delete all related data in a transaction to ensure permanent wipe
    return this.db.$transaction(async (tx) => {
      // 0. Delete AI insights (Fixing the reported FK error)
      await tx.aiInsight.deleteMany({ where: { shopId: id } });

      // 1. Delete transactional/usage data
      await tx.orderItem.deleteMany({ where: { order: { shopId: id } } });
      await tx.order.deleteMany({ where: { shopId: id } });
      await tx.payment.deleteMany({ where: { shopId: id } });
      await tx.message.deleteMany({ where: { conversation: { shopId: id } } });
      await tx.conversation.deleteMany({ where: { shopId: id } });
      await tx.usageLog.deleteMany({ where: { shopId: id } });
      await tx.tokenUsage.deleteMany({ where: { shopId: id } });

      // 2. Delete engagement/content data
      await tx.comment.deleteMany({ where: { shopId: id } });
      await tx.post.deleteMany({ where: { shopId: id } });
      await tx.campaign.deleteMany({ where: { shopId: id } });
      await tx.knowledgeBase.deleteMany({ where: { shopId: id } });

      // 3. Delete entity data
      await tx.product.deleteMany({ where: { shopId: id } });
      await tx.customer.deleteMany({ where: { shopId: id } });

      // 4. Delete notifications and users associated with this shop
      await tx.notification.deleteMany({ where: { user: { shopId: id } } });
      await tx.user.deleteMany({ where: { shopId: id } });

      // 5. Finally, delete the shop record
      return tx.shop.delete({
        where: { id },
      });
    });
  }
}
