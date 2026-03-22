import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Roles(UserRole.SUPERADMIN)
  @Post()
  @ApiOperation({ summary: 'Create a new shop (SUPERADMIN only)' })
  create(@Body() createShopDto: CreateShopDto) {
    return this.shopService.create(createShopDto);
  }

  @Roles(UserRole.SUPERADMIN)
  @Get()
  @ApiOperation({ summary: 'Get all shops (SUPERADMIN only)' })
  findAll() {
    return this.shopService.findAll();
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Get('me')
  @ApiOperation({ summary: "Get current user's shop" })
  async findMe(@Req() req: any) {
    if (!req.user.shopId) {
      throw new UnauthorizedException('User has no shop assigned');
    }
    return this.shopService.findOne(req.user.shopId);
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get shop by ID (SUPERADMIN or OWNER)' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    // Access Control: Admin can only view their own shop
    if (req.user.role === UserRole.ADMIN && req.user.shopId !== id) {
      throw new UnauthorizedException('You can only view your own shop');
    }
    return this.shopService.findOne(id);
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: 'Update shop (SUPERADMIN or OWNER)' })
  async update(
    @Param('id') id: string,
    @Body() updateShopDto: UpdateShopDto,
    @Req() req: any,
  ) {
    // Access Control: Admin can only update their own shop
    if (req.user.role === UserRole.ADMIN && req.user.shopId !== id) {
      throw new UnauthorizedException('You can only update your own shop');
    }

    return this.shopService.update(id, updateShopDto);
  }

  @Roles(UserRole.SUPERADMIN, UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete shop (SUPERADMIN or OWNER)' })
  async remove(
    @Param('id') id: string,
    @Req() req: any,
    @Body('reason') reason?: string,
  ) {
    // Access Control: Admin can only delete their own shop
    if (req.user.role === UserRole.ADMIN && req.user.shopId !== id) {
      throw new UnauthorizedException('You can only delete your own shop');
    }
    return this.shopService.remove(id, reason);
  }
}
