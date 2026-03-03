import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateShopDto } from './create-shop.dto';
import {
  IsBoolean,
  IsOptional,
  IsEmail,
  IsString,
  MinLength,
  IsNumber,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateShopDto extends PartialType(CreateShopDto) {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { tone: 'Friendly' } })
  @IsOptional()
  aiConfig?: any;

  // Superadmin can update owner credentials
  @ApiPropertyOptional({ example: 'newemail@example.com' })
  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  ownerEmail?: string;

  @ApiPropertyOptional({ example: 'newpassword123' })
  @IsString()
  @MinLength(6)
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  ownerPassword?: string;

  // AI Config
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  deliveryCharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  minOrderValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  confirmationTemplate?: string;

  // Store Config
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  currencySymbol?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  currencyCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  dateFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  taxRate?: number;

  // Branding
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  brandColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  faviconUrl?: string;

  // Business Details
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  zipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (value === '' ? null : value))
  emailSupport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  website?: string;

  // Legal
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  vatNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  businessLicense?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  termsUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  privacyUrl?: string;

  // Socials
  @ApiPropertyOptional()
  @IsOptional()
  socialLinks?: any; // Json

  // ─── Courier Integration ────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'STEADFAST', enum: ['STEADFAST', 'PATHAO'] })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  courierProvider?: string;

  @ApiPropertyOptional({ example: 'your-api-key' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  courierApiKey?: string;

  @ApiPropertyOptional({ example: 'your-secret-key' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  courierSecretKey?: string;

  // ─── RedX Integration ────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'eyJhbGci...' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  redxToken?: string;

  @ApiPropertyOptional({ example: '12345' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  redxStoreId?: string;
}
