import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    UseGuards,
    Req,
    UnauthorizedException,
    Query,
} from '@nestjs/common';
import { InboxService } from './inbox.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('inbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inbox')
export class InboxController {
    constructor(private readonly inboxService: InboxService) { }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Get('conversations')
    @ApiOperation({ summary: 'Get all conversations for the current shop' })
    async getConversations(
        @Req() req: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        if (!req.user.shopId) {
            throw new UnauthorizedException('User has no shop assigned');
        }
        return this.inboxService.getConversations(
            req.user.shopId,
            Number(page) || 1,
            Number(limit) || 20,
        );
    }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Get('conversations/:id/messages')
    @ApiOperation({ summary: 'Get message history for a conversation' })
    async getMessages(@Param('id') id: string, @Req() req: any) {
        return this.inboxService.getMessages(id, req.user.shopId);
    }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Post('send')
    @ApiOperation({ summary: 'Send a message to a customer' })
    async sendMessage(
        @Body() body: { conversationId: string; content: string },
        @Req() req: any,
    ) {
        return this.inboxService.sendMessage(
            req.user.shopId,
            body.conversationId,
            body.content,
        );
    }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Post('conversations/:id/notes')
    @ApiOperation({ summary: 'Add an internal note to a conversation' })
    async addNote(
        @Param('id') id: string,
        @Body() body: { note: string },
        @Req() req: any,
    ) {
        return this.inboxService.addInternalNote(id, body.note, req.user.id);
    }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Post('conversations/:id/tags')
    @ApiOperation({ summary: 'Update tags for a conversation' })
    async updateTags(
        @Param('id') id: string,
        @Body() body: { tags: string[] },
        @Req() req: any,
    ) {
        return this.inboxService.updateTags(id, body.tags);
    }

    @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    @Post('conversations/:id/order')
    @ApiOperation({ summary: 'Create an order from a conversation' })
    async createOrder(
        @Param('id') id: string,
        @Body() orderData: any,
        @Req() req: any,
    ) {
        return this.inboxService.createOrder(id, req.user.shopId, orderData);
    }
}
