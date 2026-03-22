import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
} from 'class-validator';
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

  @ApiProperty({
    description:
      'Order Items (Description string or Array of {productId, quantity})',
  })
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

  @ApiProperty({ description: 'PSID (Facebook User ID)', required: false })
  @IsString()
  @IsOptional()
  psid?: string;

  @ApiProperty({
    description: 'Delivery Type (inside/outside)',
    required: false,
  })
  @IsString()
  @IsOptional()
  delivery_type?: string;

  @ApiProperty({
    description: 'Appointment Date for Services',
    required: false,
  })
  @IsString()
  @IsOptional()
  appointmentDate?: string;

  @ApiProperty({ description: 'Notes for Service', required: false })
  @IsString()
  @IsOptional()
  serviceNotes?: string;

  @ApiProperty({
    description: 'Courier Name (e.g. RedX, Steadfast)',
    required: false,
  })
  @IsString()
  @IsOptional()
  courierName?: string;

  @ApiProperty({ description: 'Courier shipment status', required: false })
  @IsString()
  @IsOptional()
  shipmentStatus?: string;

  @ApiProperty({
    description: 'Products subtotal before delivery fee',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  subTotal?: number;

  @ApiProperty({
    description: 'Delivery fee applied to order',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  deliveryFee?: number;
}
