import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PromoService {
  constructor(private readonly db: DatabaseService) {}

  async validatePromo(code: string) {
    const promo = await this.db.promoCode.findUnique({ where: { code } });
    if (!promo) {
      throw new NotFoundException('Promo code not found');
    }
    if (!promo.isActive) {
      throw new BadRequestException('Promo code is inactive');
    }
    return {
      discountPercent: promo.discountPercent,
      promoId: promo.id,
    };
  }
}
