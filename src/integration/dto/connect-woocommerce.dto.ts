import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class ConnectWooCommerceDto {
  @IsUrl({ require_tld: false })
  url: string;

  @IsString()
  @IsNotEmpty()
  consumerKey: string;

  @IsString()
  @IsNotEmpty()
  consumerSecret: string;
}
