import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateShopDto } from './create-shop.dto';
import { IsBoolean, IsOptional, IsEmail, IsString, MinLength, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
    ownerEmail?: string;

    @ApiPropertyOptional({ example: 'newpassword123' })
    @IsString()
    @MinLength(6)
    @IsOptional()
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
    confirmationTemplate?: string;

    // Store Config
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    currencySymbol?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    currencyCode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    timezone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    dateFormat?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    taxRate?: number;

    // Branding
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
    faviconUrl?: string;

    // Business Details
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    country?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    zipCode?: string;

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

    // Legal
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vatNumber?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    businessLicense?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    termsUrl?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    privacyUrl?: string;

    // Socials
    @ApiPropertyOptional()
    @IsOptional()
    socialLinks?: any; // Json
}
