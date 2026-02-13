import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Wireless Headphones' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 49.99 })
  @IsNumber()
  @IsNotEmpty()
  price: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @IsNotEmpty()
  stock: number;

  @ApiPropertyOptional({ example: 'High-quality noise-canceling headphones' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'WH-1000XM4' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'Electronics' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'https://cdn-shopsync.aixplore.me/products/image.jpg' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'pcs' })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { color: 'Black', wireless: true } })
  @IsObject()
  @IsOptional()
  attributes?: any;
}
