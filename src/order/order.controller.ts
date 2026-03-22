import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
  UseGuards,
  Post,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { PushToCourierDto } from './dto/push-to-courier.dto';
import { PushToRedxDto } from './dto/push-to-redx.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiQuery,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';

import { AiAnalyticsSchedulerService } from '../ai/ai-analytics-scheduler.service';

@ApiTags('order')
@Controller('order')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly aiScheduler: AiAnalyticsSchedulerService,
  ) {}

  // ─── Metrics ──────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('metrics')
  getMetrics(@CurrentUser('shopId') shopId: string) {
    return this.orderService.getMetrics(shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Fetch historical AI batch insights (deep-dive)' })
  @Get('ai-insights')
  getAiInsights(@CurrentUser('shopId') shopId: string) {
    return this.orderService.getAiInsights(shopId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Manually trigger AI batch analysis for current shop',
  })
  @Post('trigger-ai-analysis')
  async triggerAiAnalysis(
    @CurrentUser('shopId') shopId: string,
    @Body('days') days?: number,
  ) {
    await this.aiScheduler.triggerManualAnalysis(shopId, days || 1);
    return {
      message: 'AI Analysis manually triggered. It may take a few minutes.',
      shopId,
      days: days || 1,
    };
  }

  // ─── RedX helper — must be declared BEFORE `:id` routes ──────────────────

  /**
   * GET /order/redx-areas
   * Returns RedX delivery areas for the shop to power the autocomplete dropdown.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Fetch RedX delivery areas for the area selector' })
  @Get('redx-areas')
  getRedxAreas(@CurrentUser('shopId') shopId: string) {
    return this.orderService.getRedxAreas(shopId);
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.orderService.create(createOrderDto, shopId);
  }

  /**
   * GET /order?page=1&limit=20&status=PENDING
   * Paginated, filterable order list for the Orders dashboard.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @Get()
  findAll(
    @CurrentUser('shopId') shopId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.orderService.findAllPaginated(shopId, page, limit, status);
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

  // ─── Courier push endpoints ───────────────────────────────────────────────

  /**
   * POST /order/:id/push-to-courier
   * Generic courier push (Steadfast / Pathao).
   * Body is optional — fields override AI-extracted values.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Push order to Steadfast / Pathao courier' })
  @Post(':id/push-to-courier')
  pushToCourier(
    @Param('id') id: string,
    @Body() dto: PushToCourierDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.orderService.pushToCourier(id, shopId, dto);
  }

  /**
   * POST /order/:id/push
   * RedX-specific push using per-shop redxToken.
   * Requires deliveryAreaId (either in body or already saved on order).
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Push order to RedX courier (magic button)' })
  @Post(':id/push')
  pushToRedx(
    @Param('id') id: string,
    @Body() dto: PushToRedxDto,
    @CurrentUser('shopId') shopId: string,
  ) {
    return this.orderService.pushToRedx(id, shopId, dto);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('shopId') shopId: string) {
    return this.orderService.remove(id, shopId);
  }
}
