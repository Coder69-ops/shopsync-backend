import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';

/**
 * Optional overrides a merchant can supply when pushing an order to courier.
 * If omitted, values are read from the saved order record.
 */
export class PushToCourierDto {
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
  customerAddress?: string;

  @ApiPropertyOptional({ description: 'Override cash-on-delivery amount' })
  @IsNumber()
  @IsOptional()
  totalAmount?: number;
}
