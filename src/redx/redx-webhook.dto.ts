import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RedxWebhookDto {
  @IsString()
  @IsNotEmpty()
  tracking_number: string;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  timestamp?: string;

  @IsString()
  @IsOptional()
  message_en?: string;

  @IsString()
  @IsOptional()
  message_bn?: string;

  @IsString()
  @IsOptional()
  invoice_number?: string;
}
