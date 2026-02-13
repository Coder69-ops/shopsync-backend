import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { DatabaseModule } from '../database/database.module';
import { CourierModule } from '../courier/courier.module';
import { FacebookModule } from '../facebook/facebook.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [DatabaseModule, CourierModule, FacebookModule, CustomerModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule { }
