import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const csv = require('csv-parser');
import { Readable } from 'stream';

@Injectable()
export class ProductService {
  constructor(private readonly databaseService: DatabaseService) { }

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
        throw new ConflictException(`SKU "${createProductDto.sku}" is already in use.`);
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
        shop: {
          connect: { id: shopId },
        },
      },
    });
  }

  async findAll(shopId: string) {
    return this.databaseService.product.findMany({
      where: { shopId },
      orderBy: { updatedAt: 'desc' },
    });
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
        throw new ConflictException(`SKU "${updateProductDto.sku}" is already in use.`);
      }
    }

    // 3. Update Product
    return this.databaseService.product.update({
      where: { id },
      data: {
        ...(updateProductDto.name && { name: updateProductDto.name }),
        ...(updateProductDto.price !== undefined && { price: updateProductDto.price }),
        ...(updateProductDto.stock !== undefined && { stock: updateProductDto.stock }),
        ...(updateProductDto.description !== undefined && { description: updateProductDto.description }),
        ...(updateProductDto.sku && { sku: updateProductDto.sku }),
        ...(updateProductDto.category && { category: updateProductDto.category }),
        ...(updateProductDto.imageUrl !== undefined && { imageUrl: updateProductDto.imageUrl }),
        ...(updateProductDto.unit && { unit: updateProductDto.unit }),
        ...(updateProductDto.isActive !== undefined && { isActive: updateProductDto.isActive }),
        ...(updateProductDto.attributes && { attributes: updateProductDto.attributes }),
      },
    });
  }

  async remove(id: string, shopId: string) {
    return this.databaseService.product.deleteMany({
      where: { id, shopId },
    });
  }

  async getLowStockProducts(shopId: string, threshold: number = 5) {
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
        .on('error', (err: any) => reject(new ConflictException('Error parsing CSV: ' + err.message)))
        .on('end', async () => {
          try {
            const createdProducts = [];
            const errors = [];

            // 1. Check Shop Plan & Limits (Basic check - total items)
            const shop = await this.databaseService.shop.findUnique({
              where: { id: shopId },
              include: { _count: { select: { products: true } } },
            });

            if (!shop) throw new NotFoundException('Shop not found');

            let limit = 50; // Increased for Demo
            if (shop.plan === 'BASIC') limit = 100;
            if (shop.plan === 'PRO') limit = Infinity;

            if (shop._count.products + results.length > limit) {
              return reject(new ForbiddenException(`Import would exceed plan limit of ${limit} products.`));
            }

            // 2. Process each row
            for (const [index, row] of results.entries()) {
              try {
                // strict validation
                if (!row.name || !row.price || !row.stock) {
                  throw new Error('Missing required fields (name, price, stock)');
                }

                const productDto: CreateProductDto = {
                  name: row.name,
                  price: parseFloat(row.price),
                  stock: parseInt(row.stock),
                  description: row.description,
                  sku: row.sku || `PROD-${Date.now()}-${index}`,
                  category: row.category,
                  imageUrl: row.imageUrl,
                  unit: row.unit,
                  isActive: row.isActive === 'true' || row.isActive === true,
                  attributes: row.attributes ? JSON.parse(row.attributes) : {},
                };

                // Check SKU if provided
                if (row.sku) {
                  const existing = await this.databaseService.product.findUnique({
                    where: { shopId_sku: { shopId, sku: row.sku } }
                  });
                  if (existing) throw new Error(`SKU ${row.sku} already exists`);
                }

                const product = await this.databaseService.product.create({
                  data: {
                    ...productDto,
                    shop: { connect: { id: shopId } },
                  },
                });
                createdProducts.push(product);
              } catch (error) {
                console.error(`Import failed for row ${index + 1}:`, error.message, row);
                errors.push({ row: index + 1, error: error.message, data: row });
              }
            }

            resolve({
              success: true,
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

  getSampleCsv(): string {
    const headers = [
      'name',
      'price',
      'stock',
      'description',
      'sku',
      'category',
      'imageUrl',
      'unit',
      'isActive',
      'attributes',
    ];
    const sampleRow = [
      'Sample Product',
      '19.99',
      '100',
      'A great sample product',
      'SKU-123',
      'Electronics',
      'https://example.com/image.jpg',
      'pcs',
      'true',
      '"{""Color"": ""Red"", ""Size"": ""M""}"',
    ];
    return headers.join(',') + '\n' + sampleRow.join(',');
  }
}
