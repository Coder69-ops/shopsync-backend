import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class FacebookCapiService {
  private readonly logger = new Logger(FacebookCapiService.name);
  private readonly pixelId: string;
  private readonly accessToken: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.pixelId = this.configService.get<string>('FACEBOOK_PIXEL_ID') || '';
    this.accessToken =
      this.configService.get<string>('FACEBOOK_CAPI_TOKEN') || '';
    // মেটা গ্রাফ এপিআই v19.0 এর এন্ডপয়েন্ট
    this.apiUrl = `https://graph.facebook.com/v19.0/${this.pixelId}/events`;
  }

  // কাস্টমার ডাটা সিকিউর করতে SHA-256 হ্যাশিং মেথড
  private hashData(data: string): string {
    if (!data) return '';
    // Facebook-এর নিয়ম অনুযায়ী স্ট্রিং ছোট হাতের (lowercase) এবং স্পেস ছাড়া হতে হবে
    return crypto
      .createHash('sha256')
      .update(data.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Start Trial ইভেন্ট Facebook-এ পাঠানোর ফাংশন
   */
  async sendStartTrialEvent(
    userData: {
      email: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
    },
    reqParams?: { clientIp?: string; userAgent?: string; sourceUrl?: string },
  ) {
    if (!this.pixelId || !this.accessToken) {
      this.logger.warn(
        'Facebook CAPI credentials missing in environment variables.',
      );
      return;
    }

    const payload = {
      data: [
        {
          event_name: 'StartTrial',
          event_time: Math.floor(Date.now() / 1000), // বর্তমান সময় (Unix Timestamp in seconds)
          action_source: 'website',
          event_source_url:
            reqParams?.sourceUrl || 'https://আপনার-ওয়েবসাইট.com/register',
          user_data: {
            // ডাটা হ্যাশ করে অ্যারে আকারে পাঠাতে হয়
            em: [this.hashData(userData.email)],
            ph: userData.phone ? [this.hashData(userData.phone)] : undefined,
            fn: userData.firstName
              ? [this.hashData(userData.firstName)]
              : undefined,
            ln: userData.lastName
              ? [this.hashData(userData.lastName)]
              : undefined,
            client_ip_address: reqParams?.clientIp,
            client_user_agent: reqParams?.userAgent,
          },
          // আপনি চাইলে কাস্টম ডাটাও পাঠাতে পারেন
          custom_data: {
            currency: 'BDT',
            value: 0.0, // ট্রায়াল হওয়ায় ভ্যালু 0 হতে পারে
          },
        },
      ],
      // Test event-এর জন্য test_event_code ব্যবহার করতে পারেন (প্রোডাকশনে বাদ দিন)
      // test_event_code: 'TEST23485'
    };

    try {
      const response = await axios.post(
        `${this.apiUrl}?access_token=${this.accessToken}`,
        payload,
      );
      this.logger.log(
        `[CAPI] StartTrial event sent! FB Trace ID: ${response.data.fbtrace_id}`,
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[CAPI] Failed to send StartTrial event: ${
          error.response?.data?.error?.message || error.message
        }`,
      );
    }
  }
}
