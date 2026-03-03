import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Get('active')
  async getActive() {
    return this.broadcastService.getActiveBroadcasts();
  }

  // Super Admin Only Routes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Get('all')
  async getAll() {
    return this.broadcastService.getAllBroadcasts();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post()
  async create(@Body() data: any) {
    return this.broadcastService.createBroadcast(data);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.broadcastService.toggleActive(id, isActive);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.broadcastService.deleteBroadcast(id);
  }
}
