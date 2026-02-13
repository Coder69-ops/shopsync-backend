import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhookModule } from './webhook/webhook.module';
import { AiModule } from './ai/ai.module';
import { OrderModule } from './order/order.module';
import { DatabaseModule } from './database/database.module';
import { ProductModule } from './product/product.module';
import { VoiceModule } from './voice/voice.module';
import { CourierModule } from './courier/courier.module';
import { AuthModule } from './auth/auth.module';
import { SuperadminModule } from './superadmin/superadmin.module';
import { ShopModule } from './shop/shop.module';
import { FacebookModule } from './facebook/facebook.module';
import { CustomerModule } from './customer/customer.module';
import { MarketingModule } from './marketing/marketing.module';
import { CommentModule } from './comment/comment.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST') || 'localhost',
          port: configService.get('REDIS_PORT') || 6379,
        },
      }),
      inject: [ConfigService],
    }),
    WebhookModule,
    AiModule,
    OrderModule,
    DatabaseModule,
    ProductModule,
    VoiceModule,
    CourierModule,
    AuthModule,
    SuperadminModule,
    ShopModule,
    FacebookModule,
    CustomerModule,
    MarketingModule,
    CommentModule,
    UploadModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
