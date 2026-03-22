import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { PromoService } from './promo.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('promo')
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  async validate(@Body('code') code: string) {
    return this.promoService.validatePromo(code);
  }
}
