import { Controller, Get, UseGuards } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('superadmin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) { }

  @Roles(UserRole.SUPERADMIN)
  @Get('stats')
  getStats() {
    return this.superadminService.getStats();
  }

  @Roles(UserRole.SUPERADMIN)
  @Get('shops')
  getShops() {
    return this.superadminService.getShops();
  }
}
