import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
  UseGuards,
  Post,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('metrics')
  getMetrics(@CurrentUser('shopId') shopId: string) {
    return this.orderService.getMetrics(shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @CurrentUser('shopId') shopId: string) {
    return this.orderService.create(createOrderDto, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser('shopId') shopId: string) {
    return this.orderService.findAll(shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('shopId') shopId: string) {
    return this.orderService.findOne(id, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.orderService.update(id, updateOrderDto, shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('shopId') shopId: string) {
    return this.orderService.remove(id, shopId);
  }
}
