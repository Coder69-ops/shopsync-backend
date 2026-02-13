import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FacebookService {
    private readonly logger = new Logger(FacebookService.name);

    constructor(private configService: ConfigService) { }

    async sendMessage(recipientId: string, messageText: string, pageAccessToken: string, pageId?: string) {
        try {
            // Fail-Safe: Truncate to 2000 chars for Facebook limit
            const truncatedText = messageText.length > 2000 ? messageText.substring(0, 1997) + '...' : messageText;
            this.logger.log(`Sending message to ${recipientId}: ${truncatedText.substring(0, 50)}...`);

            const target = pageId || 'me';
            const url = `https://graph.facebook.com/v19.0/${target}/messages?access_token=${pageAccessToken}`;

            await axios.post(url, {
                recipient: { id: recipientId },
                message: { text: truncatedText },
                messaging_type: 'RESPONSE',
            });

            this.logger.log('Message sent successfully');
        } catch (error) {
            this.logger.error('Error sending Facebook message', error.response?.data || error.message);
        }
    }

    async replyToComment(commentId: string, message: string, pageAccessToken: string) {
        try {
            const truncatedText = message.length > 2000 ? message.substring(0, 1997) + '...' : message;
            this.logger.log(`Replying to comment ${commentId}: ${truncatedText.substring(0, 50)}...`);

            const url = `https://graph.facebook.com/v21.0/${commentId}/comments?access_token=${pageAccessToken}`;

            await axios.post(url, {
                message: truncatedText,
            });

            this.logger.log('Comment reply sent successfully');
        } catch (error) {
            this.logger.error('Error replying to comment', error.response?.data || error.message);
        }
    }

    async sendPrivateReply(commentId: string, message: string, pageAccessToken: string): Promise<boolean> {
        try {
            const truncatedText = message.length > 2000 ? message.substring(0, 1997) + '...' : message;
            this.logger.log(`Sending private reply to comment ${commentId}: ${truncatedText.substring(0, 50)}...`);

            const url = `https://graph.facebook.com/v21.0/${commentId}/private_replies?access_token=${pageAccessToken}`;

            await axios.post(url, {
                message: truncatedText,
            });

            this.logger.log('Private reply sent successfully');
            return true;
        } catch (error) {
            const fbError = error.response?.data?.error;
            if (fbError?.error_subcode === 33) {
                this.logger.warn('Private reply already sent or not supported via comment ID endpoint. Triggering fallback...');
                return false; // Return false to trigger sendMessage fallback
            }
            this.logger.error('Error sending private reply', fbError || error.message);
            return false;
        }
    }
}
