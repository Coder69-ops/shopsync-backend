import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
    cors: {
        origin: '*', // In production, this should be restricted
        credentials: true,
    },
    namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(ChatGateway.name);

    constructor(private readonly jwtService: JwtService) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
            if (!token) {
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token);
            client.data.user = payload;

            // Join a room for the specific shop
            if (payload.shopId) {
                client.join(`shop_${payload.shopId}`);
                this.logger.log(`Client ${client.id} joined room shop_${payload.shopId}`);
            }
        } catch (e) {
            this.logger.error(`Connection failed: ${e.message}`);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    @SubscribeMessage('typing')
    handleTyping(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string; isTyping: boolean },
    ) {
        const shopId = client.data.user.shopId;
        client.to(`shop_${shopId}`).emit('user_typing', {
            conversationId: data.conversationId,
            adminName: client.data.user.name || 'Admin',
            isTyping: data.isTyping,
        });
    }

    @SubscribeMessage('viewing')
    handleViewing(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string },
    ) {
        const shopId = client.data.user.shopId;
        client.to(`shop_${shopId}`).emit('admin_viewing', {
            conversationId: data.conversationId,
            adminName: client.data.user.name || 'Admin',
            adminId: client.data.user.id,
        });
    }

    // Helper to emit new messages to all clients in a shop room
    emitNewMessage(shopId: string, message: any) {
        this.server.to(`shop_${shopId}`).emit('message_new', message);
    }

    // Helper to emit conversation updates (last message, status, etc.)
    emitConversationUpdate(shopId: string, conversation: any) {
        this.server.to(`shop_${shopId}`).emit('conversation_updated', conversation);
    }
}
