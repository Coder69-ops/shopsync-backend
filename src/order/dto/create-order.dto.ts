import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiProperty({ description: 'Customer Name' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Customer Phone' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiProperty({ description: 'Customer Address' })
  @IsString()
  @IsNotEmpty()
  customerAddress: string;

  @ApiProperty({ description: 'Order Items (Description string or Array of {productId, quantity})' })
  @IsOptional()
  items?: any; // Can be string or Array<{ productId: string; quantity: number }>

  @ApiProperty({ description: 'Total Price' })
  @IsNumber()
  totalPrice: number;

  @ApiProperty({ description: 'Order Status', default: 'CONFIRMED' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Source of the order', default: 'MANUAL' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({ description: 'Tracking ID', required: false })
  @IsString()
  @IsOptional()
  trackingId?: string;
}
