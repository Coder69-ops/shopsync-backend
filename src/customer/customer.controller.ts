import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('customer')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) { }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async findAll(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    const shopId = req.user.shopId;
    return this.customerService.findAll(shopId, Number(page) || 1, Number(limit) || 20);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async getStats(@Req() req: any) {
    const shopId = req.user.shopId;
    return this.customerService.getStats(shopId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async findOne(@Param('id') id: string, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.customerService.findOne(id, shopId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const shopId = req.user.shopId;
    return this.customerService.update(id, shopId, body);
  }
}
