import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [CourierService],
  exports: [CourierService], // Export so OrderModule can use it
})
export class CourierModule {}
