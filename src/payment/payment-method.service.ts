import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PaymentMethod } from '@prisma/client';

@Injectable()
export class PaymentMethodService {
  constructor(private db: DatabaseService) {}

  async getAll(includeInactive = false) {
    return this.db.paymentMethod.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(data: any) {
    return this.db.paymentMethod.create({ data });
  }

  async update(id: string, data: any) {
    const method = await this.db.paymentMethod.findUnique({ where: { id } });
    if (!method) throw new NotFoundException('Payment method not found');

    return this.db.paymentMethod.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.paymentMethod.delete({ where: { id } });
  }

  async seedDefaults() {
    const count = await this.db.paymentMethod.count();
    if (count === 0) {
      await this.db.paymentMethod.createMany({
        data: [
          {
            name: 'bKash',
            type: 'MOBILE_BANKING',
            identifiers: { 'Account Number': '017XXXXXXXX' },
            instruction: 'Use Send Money option.',
            logo: 'bkash',
            isActive: true,
          },
          {
            name: 'Nagad',
            type: 'MOBILE_BANKING',
            identifiers: { 'Account Number': '018XXXXXXXX' },
            instruction: 'Use Payment option (Counter 1).',
            logo: 'nagad',
            isActive: true,
          },
        ],
      });
    }
  }
}
