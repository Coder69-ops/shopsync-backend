import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsPositive,
  Min,
} from 'class-validator';

/**
 * Payload sent by the merchant when clicking "Push to RedX".
 * All fields are optional overrides — if omitted the saved Order values are used.
 * deliveryAreaId + deliveryAreaName MUST be present either in the DTO or already
 * on the Order; the service enforces this before calling the RedX API.
 */
export class PushToRedxDto {
  @ApiPropertyOptional({ description: 'Override customer name' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Override customer phone' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Override delivery address' })
  @IsString()
  @IsOptional()
  deliveryAddress?: string;

  @ApiProperty({
    description: 'RedX delivery area ID (from GET /order/redx-areas)',
    example: 1,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  deliveryAreaId?: number;

  @ApiPropertyOptional({
    description: 'RedX delivery area name (human-readable)',
    example: 'Dhaka',
  })
  @IsString()
  @IsOptional()
  deliveryAreaName?: string;

  @ApiPropertyOptional({
    description:
      'Cash-on-delivery amount in BDT (defaults to Order totalPrice)',
    example: 950,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cashCollectionAmount?: number;

  @ApiPropertyOptional({
    description: 'Parcel weight in grams (min 500, default 500)',
    example: 500,
  })
  @IsInt()
  @Min(500)
  @IsOptional()
  parcelWeight?: number;
}
