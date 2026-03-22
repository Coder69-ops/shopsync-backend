import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.productService.create(createProductDto, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importProducts(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.productService.importProducts(file, shopId);
  }

  @Get('sample-csv')
  getSampleCsv(@Query('type') type: string, @Res() res: Response) {
    const csv = this.productService.getSampleCsv(type);
    res.header('Content-Type', 'text/csv');
    const filename = type
      ? `${type.toLowerCase()}_sample.csv`
      : 'products_sample.csv';
    res.attachment(filename);
    return res.send(csv);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('low-stock')
  getLowStock(@CurrentUser('shopId') shopId: string) {
    return this.productService.getLowStockProducts(shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @CurrentUser('shopId') shopId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productService.findAll(
      shopId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('shopId') shopId: string) {
    return this.productService.findOne(id, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.productService.update(id, updateProductDto, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('shopId') shopId: string) {
    return this.productService.remove(id, shopId);
  }
}
