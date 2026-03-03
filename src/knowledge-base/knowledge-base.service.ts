import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class KnowledgeBaseService {
  constructor(private db: DatabaseService) {}

  async create(shopId: string, data: { question: string; answer: string }) {
    return this.db.knowledgeBase.create({
      data: {
        shopId,
        question: data.question,
        answer: data.answer,
      },
    });
  }

  async findAll(shopId: string) {
    return this.db.knowledgeBase.findMany({
      where: { shopId },
    });
  }

  async findOne(shopId: string, id: string) {
    const entry = await this.db.knowledgeBase.findFirst({
      where: { id, shopId },
    });
    if (!entry) throw new NotFoundException('Knowledge base entry not found');
    return entry;
  }

  async update(
    shopId: string,
    id: string,
    data: { question?: string; answer?: string },
  ) {
    await this.findOne(shopId, id); // Ensure it exists and belongs to shop
    return this.db.knowledgeBase.update({
      where: { id },
      data,
    });
  }

  async remove(shopId: string, id: string) {
    await this.findOne(shopId, id); // Ensure it exists and belongs to shop
    return this.db.knowledgeBase.delete({
      where: { id },
    });
  }
}
