import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CommentService {
    // Nudge: Service updated to recognize new Comment model
    constructor(private db: DatabaseService) { }

    async findAll(shopId: string) {
        return this.db.comment.findMany({
            where: { shopId },
            include: {
                post: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string, shopId: string) {
        return this.db.comment.findFirst({
            where: { id, shopId },
            include: {
                post: true,
            },
        });
    }

    async delete(id: string, shopId: string) {
        return this.db.comment.deleteMany({
            where: { id, shopId },
        });
    }
}
