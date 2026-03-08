import { Module } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { InboxController } from './inbox.controller';
import { DatabaseModule } from '../database/database.module';
import { FacebookModule } from '../facebook/facebook.module';
import { AuthModule } from '../auth/auth.module';
import { OrderModule } from '../order/order.module';
import { ChatGateway } from './chat.gateway';

@Module({
    imports: [DatabaseModule, FacebookModule, AuthModule, OrderModule],
    controllers: [InboxController],
    providers: [InboxService, ChatGateway],
    exports: [InboxService, ChatGateway],
})
export class InboxModule { }
