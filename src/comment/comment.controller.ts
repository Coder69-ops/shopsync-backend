import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('comments')
@UseGuards(JwtAuthGuard)
export class CommentController {
    constructor(private readonly commentService: CommentService) { }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.commentService.findAll(user.shopId);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.commentService.findOne(id, user.shopId);
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @CurrentUser() user: any) {
        return this.commentService.delete(id, user.shopId);
    }
}
