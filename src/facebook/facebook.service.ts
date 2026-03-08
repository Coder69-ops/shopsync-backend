import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  constructor(private configService: ConfigService) { }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
    try {
      const appId = this.configService.get<string>('FACEBOOK_APP_ID');
      const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');

      if (!appId || !appSecret) {
        this.logger.error(
          'Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET in environment variables',
        );
        throw new Error('Facebook App Credentials missing');
      }

      const url = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      const response = await axios.get(url);

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(
        'Error exchanging token',
        error.response?.data || error.message,
      );
      throw new Error('Failed to exchange token');
    }
  }

  async exchangeCodeForAccessToken(code: string): Promise<string> {
    try {
      const appId = this.configService.get<string>('FACEBOOK_APP_ID');
      const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET');

      if (!appId || !appSecret) {
        this.logger.error('Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET');
        throw new Error('Facebook App Credentials missing');
      }

      // Use v24.0 to remain consistent with existing service calls
      const url = `https://graph.facebook.com/v24.0/oauth/access_token`;
      const response = await axios.get(url, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code: code,
        },
      });

      return response.data.access_token;
    } catch (error: any) {
      this.logger.error(
        'Error exchanging code for access token',
        error.response?.data || error.message,
      );
      throw new Error('Failed to exchange Facebook code');
    }
  }

  async getManagedPages(longLivedToken: string): Promise<any[]> {
    try {
      this.logger.log('Fetching managed pages...');
      const url = `https://graph.facebook.com/v24.0/me/accounts?access_token=${longLivedToken}&fields=name,id,access_token,picture`;
      const response = await axios.get(url);

      this.logger.log(`Found ${response.data.data?.length || 0} pages in Facebook response.`);
      if (response.data.data && response.data.data.length > 0) {
        this.logger.debug('First page found: ' + response.data.data[0].name);
      }

      return response.data.data; // Facebook returns { data: [...] }
    } catch (error: any) {
      this.logger.error(
        'Error fetching pages',
        error.response?.data || error.message,
      );
      throw new Error('Failed to fetch Facebook pages');
    }
  }

  async sendMessage(
    recipientId: string,
    messageText: string,
    pageAccessToken: string,
    pageId?: string,
  ) {
    try {
      // Fail-Safe: Truncate to 2000 chars for Facebook limit
      const truncatedText =
        messageText.length > 2000
          ? messageText.substring(0, 1997) + '...'
          : messageText;
      this.logger.log(
        `Sending message to ${recipientId}: ${truncatedText.substring(0, 50)}...`,
      );

      if (process.env.LOAD_TEST_MODE === 'true') {
        this.logger.log(`[LOAD TEST MODE] Bypassed Facebook send message to ${recipientId}`);
        return;
      }

      const target = pageId || 'me';
      const url = `https://graph.facebook.com/v24.0/${target}/messages?access_token=${pageAccessToken}`;

      await axios.post(url, {
        recipient: { id: recipientId },
        message: { text: truncatedText },
        messaging_type: 'RESPONSE',
      });

      this.logger.log('Message sent successfully');
    } catch (error) {
      this.logger.error(
        'Error sending Facebook message',
        error.response?.data || error.message,
      );
    }
  }

  async replyToComment(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ) {
    try {
      const truncatedText =
        message.length > 2000 ? message.substring(0, 1997) + '...' : message;
      this.logger.log(
        `Replying to comment ${commentId}: ${truncatedText.substring(0, 50)}...`,
      );

      const url = `https://graph.facebook.com/v24.0/${commentId}/comments?access_token=${pageAccessToken}`;

      await axios.post(url, {
        message: truncatedText,
      });

      this.logger.log('Comment reply sent successfully');
    } catch (error) {
      this.logger.error(
        'Error replying to comment',
        error.response?.data || error.message,
      );
    }
  }

  async sendPrivateReply(
    commentId: string,
    message: string,
    pageAccessToken: string,
  ): Promise<boolean> {
    try {
      const truncatedText =
        message.length > 2000 ? message.substring(0, 1997) + '...' : message;
      this.logger.log(
        `Sending private reply to comment ${commentId}: ${truncatedText.substring(0, 50)}...`,
      );

      const url = `https://graph.facebook.com/v24.0/${commentId}/private_replies?access_token=${pageAccessToken}`;

      await axios.post(url, {
        message: truncatedText,
      });

      this.logger.log('Private reply sent successfully');
      return true;
    } catch (error) {
      const fbError = error.response?.data?.error;
      if (fbError?.error_subcode === 33) {
        this.logger.warn(
          'Private reply already sent or not supported via comment ID endpoint. Triggering fallback...',
        );
        return false; // Return false to trigger sendMessage fallback
      }
      this.logger.error(
        'Error sending private reply',
        fbError || error.message,
      );
      return false;
    }
  }

  async getUserProfile(psid: string, pageAccessToken: string): Promise<{ name: string; profilePic: string } | null> {
    try {
      const url = `https://graph.facebook.com/v24.0/${psid}?fields=first_name,last_name,profile_pic&access_token=${pageAccessToken}`;
      const response = await axios.get(url);

      return {
        name: `${response.data.first_name || ''} ${response.data.last_name || ''}`.trim() || 'Facebook User',
        profilePic: response.data.profile_pic || '',
      };
    } catch (error) {
      this.logger.error(`Failed to fetch user profile for psid: ${psid}`, error.response?.data || error.message);
      return null;
    }
  }
}
