import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShopDto {
  @ApiProperty({ example: 'Fashion Hub BD' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '123456789012345' })
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @ApiProperty({ example: 'EAAxxxxxxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiProperty({ example: 'owner@fashionhub.com' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  adminPassword: string;

  @ApiProperty({ enum: ['FREE', 'BASIC', 'PRO'], example: 'FREE' })
  @IsEnum(['FREE', 'BASIC', 'PRO'])
  plan: 'FREE' | 'BASIC' | 'PRO';

  // Branding & Business (Optional on creation)
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  emailSupport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;
}
