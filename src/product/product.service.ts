import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { EmailService } from '../email/email.service';
import { SystemConfigService } from '../superadmin/system-config.service';

const csv = require('csv-parser');
import { Readable } from 'stream';

@Injectable()
export class ProductService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emailService: EmailService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async create(createProductDto: CreateProductDto, shopId: string) {
    // 1. Check Shop Plan & Limits
    const shop = await this.databaseService.shop.findUnique({
      where: { id: shopId },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    // 2. Enforce Limits
    const productCount = shop._count.products;
    let limit = 10; // Default (FREE)

    switch (shop.plan) {
      case 'BASIC':
        limit = 100;
        break;
      case 'PRO':
        limit = Infinity;
        break;
      case 'FREE':
      default:
        limit = 50; // Increased for Demo
        break;
    }

    if (productCount >= limit) {
      throw new ForbiddenException(
        `You have reached the limit of ${limit} products for your ${shop.plan} plan. Please upgrade to add more.`,
      );
    }

    // 3. Check SKU uniqueness if provided
    if (createProductDto.sku) {
      const existingProduct = await this.databaseService.product.findUnique({
        where: {
          shopId_sku: {
            shopId: shopId,
            sku: createProductDto.sku,
          },
        },
      });

      if (existingProduct) {
        throw new ConflictException(
          `SKU "${createProductDto.sku}" is already in use.`,
        );
      }
    }

    // 4. Create Product
    return this.databaseService.product.create({
      data: {
        name: createProductDto.name,
        price: createProductDto.price,
        stock: createProductDto.stock,
        description: createProductDto.description,
        sku: createProductDto.sku || `PROD-${Date.now()}`, // Auto-gen SKU if blank
        category: createProductDto.category || 'General',
        imageUrl: createProductDto.imageUrl,
        unit: createProductDto.unit || 'pcs',
        isActive: createProductDto.isActive ?? true,
        attributes: createProductDto.attributes || {},
        type: createProductDto.type || 'PHYSICAL',
        shop: {
          connect: { id: shopId },
        },
      },
    });
  }

  async findAll(shopId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.databaseService.product.findMany({
        where: { shopId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.databaseService.product.count({ where: { shopId } }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, shopId: string) {
    const product = await this.databaseService.product.findFirst({
      where: { id, shopId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, shopId: string) {
    // 1. Check if product exists and belongs to shop
    await this.findOne(id, shopId);

    // 2. Check SKU uniqueness if updating SKU
    if (updateProductDto.sku) {
      const existingProduct = await this.databaseService.product.findUnique({
        where: {
          shopId_sku: {
            shopId: shopId,
            sku: updateProductDto.sku,
          },
        },
      });

      if (existingProduct && existingProduct.id !== id) {
        throw new ConflictException(
          `SKU "${updateProductDto.sku}" is already in use.`,
        );
      }
    }

    // 3. Update Product
    const product = await this.databaseService.product.update({
      where: { id },
      data: {
        ...(updateProductDto.name && { name: updateProductDto.name }),
        ...(updateProductDto.price !== undefined && {
          price: updateProductDto.price,
        }),
        ...(updateProductDto.stock !== undefined && {
          stock: updateProductDto.stock,
        }),
        ...(updateProductDto.description !== undefined && {
          description: updateProductDto.description,
        }),
        ...(updateProductDto.sku && { sku: updateProductDto.sku }),
        ...(updateProductDto.category && {
          category: updateProductDto.category,
        }),
        ...(updateProductDto.imageUrl !== undefined && {
          imageUrl: updateProductDto.imageUrl,
        }),
        ...(updateProductDto.unit && { unit: updateProductDto.unit }),
        ...(updateProductDto.isActive !== undefined && {
          isActive: updateProductDto.isActive,
        }),
        ...(updateProductDto.attributes && {
          attributes: updateProductDto.attributes,
        }),
        ...(updateProductDto.type && { type: updateProductDto.type }),
      },
      include: { shop: true },
    });

    // 4. Low Stock Alert Trigger
    const config = (await this.systemConfig.getConfig()) as any;
    const threshold = config.lowStockThreshold || 5;

    if (
      updateProductDto.stock !== undefined &&
      product.stock <= threshold &&
      product.shop?.email
    ) {
      this.emailService
        .sendLowStockAlert(product.shop.email, product.shop.name, product)
        .catch((err) =>
          console.warn(
            `[PRODUCT] Failed to send low stock alert: ${err.message}`,
          ),
        );
    }

    return product;
  }

  async remove(id: string, shopId: string) {
    return this.databaseService.product.deleteMany({
      where: { id, shopId },
    });
  }

  async getLowStockProducts(shopId: string, customThreshold?: number) {
    if (!shopId) return [];

    const config = (await this.systemConfig.getConfig()) as any;
    const threshold = customThreshold ?? (config.lowStockThreshold || 5);

    return this.databaseService.product.findMany({
      where: {
        shopId,
        stock: { lte: threshold },
        isActive: true,
      },
      take: 5,
    });
  }

  async importProducts(file: Express.Multer.File, shopId: string) {
    if (!file) {
      throw new ConflictException('No file uploaded');
    }

    const results: any[] = [];
    const stream = Readable.from(file.buffer.toString());

    return new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data: any) => results.push(data))
        .on('error', (err: any) =>
          reject(new ConflictException('Error parsing CSV: ' + err.message)),
        )
        .on('end', async () => {
          try {
            const createdProducts = [];
            const errors = [];

            // 1. Check Shop Plan & Limits
            const shop = await this.databaseService.shop.findUnique({
              where: { id: shopId },
              include: { _count: { select: { products: true } } },
            });

            if (!shop) throw new NotFoundException('Shop not found');

            let limit = 100; // Demo base
            if (shop.plan === 'BASIC') limit = 300;
            if (shop.plan === 'PRO') limit = Infinity;

            if (results.length > 500) {
              return reject(
                new ForbiddenException('Maximum 500 items per import.'),
              );
            }

            if (shop._count.products + results.length > limit) {
              return reject(
                new ForbiddenException(
                  `Import would exceed plan limit of ${limit} products. You currently have ${shop._count.products}.`,
                ),
              );
            }

            // 2. Process each row
            for (const [index, row] of results.entries()) {
              try {
                // validation
                if (!row.name || !row.price) {
                  throw new Error(`Row ${index + 1}: Missing name or price`);
                }

                const price = parseFloat(row.price);
                const stock = row.stock ? parseInt(row.stock) : 0;

                if (isNaN(price))
                  throw new Error(`Row ${index + 1}: Invalid price`);

                // Map type
                let productType: 'PHYSICAL' | 'SERVICE' | 'DIGITAL' =
                  'PHYSICAL';
                if (row.type?.toUpperCase() === 'SERVICE')
                  productType = 'SERVICE';
                if (row.type?.toUpperCase() === 'DIGITAL')
                  productType = 'DIGITAL';

                const sku =
                  row.sku ||
                  `SKU-${Date.now().toString().slice(-6)}-${index + 1}`;

                // Check SKU if provided in CSV
                if (row.sku) {
                  const existing =
                    await this.databaseService.product.findUnique({
                      where: { shopId_sku: { shopId, sku: row.sku } },
                    });
                  if (existing) {
                    throw new Error(
                      `SKU ${row.sku} already exists for this shop`,
                    );
                  }
                }

                // Process attributes
                let attributes = {};
                try {
                  if (row.attributes) {
                    attributes =
                      typeof row.attributes === 'string'
                        ? JSON.parse(row.attributes)
                        : row.attributes;
                  }
                } catch (e) {
                  console.warn(
                    `Failed to parse attributes for row ${index + 1}`,
                    e,
                  );
                }

                const product = await this.databaseService.product.create({
                  data: {
                    name: row.name,
                    price,
                    stock,
                    description: row.description || '',
                    sku,
                    category: row.category || 'General',
                    imageUrl: row.imageUrl || '',
                    unit: row.unit || 'pcs',
                    isActive: row.isActive?.toLowerCase() !== 'false',
                    type: productType,
                    attributes: attributes,
                    shop: { connect: { id: shopId } },
                  },
                });
                createdProducts.push(product);
              } catch (error) {
                console.error(
                  `Import failed for row ${index + 1}:`,
                  error.message,
                );
                errors.push({
                  row: index + 1,
                  name: row.name || 'Unknown',
                  error: error.message,
                  data: row,
                });
              }
            }

            resolve({
              success: true,
              total: results.length,
              imported: createdProducts.length,
              failed: errors.length,
              errors: errors,
            });
          } catch (error) {
            reject(error);
          }
        });
    });
  }

  getSampleCsv(type?: string): string {
    const isDigital = type?.toUpperCase() === 'DIGITAL';
    const isService = type?.toUpperCase() === 'SERVICE';

    const headers = [
      'name',
      'price',
      'stock',
      'type',
      'description',
      'sku',
      'category',
      'imageUrl',
      'unit',
      'isActive',
      'attributes',
    ];

    const sampleRow = [
      isDigital
        ? 'UI Kit Pro'
        : isService
          ? 'Custom Logo Design'
          : 'Sample Product',
      isDigital ? '49.00' : isService ? '199.00' : '19.99',
      isDigital || isService ? '9999' : '100',
      isDigital ? 'DIGITAL' : isService ? 'SERVICE' : 'PHYSICAL',
      isDigital
        ? 'Premium UI kit for Figma'
        : isService
          ? 'Professional identity design'
          : 'A great sample product',
      isDigital ? 'DIG-001' : isService ? 'SRV-001' : 'SKU-123',
      isDigital ? 'Design' : isService ? 'Graphic Design' : 'Electronics',
      'https://example.com/image.jpg',
      isDigital ? 'download' : isService ? 'project' : 'pcs',
      'true',
      isDigital
        ? '"{""Format"": ""Figma"", ""Size"": ""120MB"", ""Link"": ""https://storage.me/uikit""}"'
        : '"{""Color"": ""Red"", ""Size"": ""M""}"',
    ];

    return headers.join(',') + '\n' + sampleRow.join(',');
  }
}
