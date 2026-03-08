import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
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
import { SuperAdminModule } from './superadmin/superadmin.module';
import { ShopModule } from './shop/shop.module';
import { FacebookModule } from './facebook/facebook.module';
import { CustomerModule } from './customer/customer.module';
import { MarketingModule } from './marketing/marketing.module';
import { CommentModule } from './comment/comment.module';
import { UploadModule } from './upload/upload.module';
import { PaymentModule } from './payment/payment.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { NotificationModule } from './notification/notification.module';
import { SystemConfigModule } from './superadmin/system-config.module';
import { UsageModule } from './usage/usage.module';
import { SubscriptionModule } from './subscription/subscription.module';

import { APP_GUARD } from '@nestjs/core';
import { MaintenanceGuard } from './auth/maintenance.guard';
import { BlogModule } from './blog/blog.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { RedxModule } from './redx/redx.module';
import { IntegrationModule } from './integration/integration.module';
import { InboxModule } from './inbox/inbox.module';
import { WooCommerceModule } from './woocommerce/woocommerce.module';
import { ShopifyModule } from './shopify/shopify.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get('REDIS_URL');
        let connectionConfig: any = {};

        if (redisUrl) {
          const url = new URL(redisUrl);
          connectionConfig = {
            host: url.hostname,
            port: url.port ? parseInt(url.port, 10) : 6379,
            password: url.password || undefined,
            username: url.username || undefined,
          };
        } else {
          connectionConfig = {
            host: configService.get('REDIS_HOST') || 'localhost',
            port: configService.get('REDIS_PORT') || 6379,
            password: configService.get('REDIS_PASSWORD') || undefined,
          };
        }

        return {
          connection: connectionConfig,
        };
      },
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
    SuperAdminModule,
    ShopModule,
    FacebookModule,
    CustomerModule,
    MarketingModule,
    CommentModule,
    UploadModule,
    PaymentModule,
    BroadcastModule,
    NotificationModule,
    SystemConfigModule,
    UsageModule,
    SubscriptionModule,

    BlogModule,
    KnowledgeBaseModule,
    RedxModule,
    IntegrationModule,
    InboxModule,
    WooCommerceModule,
    ShopifyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
  ],
})
export class AppModule { }
