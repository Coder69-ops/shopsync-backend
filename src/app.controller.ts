import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Get('system/status')
  getSystemStatus() {
    return this.appService.getSystemMetrics();
  }

  @Get('privacy')
  @Header('Content-Type', 'text/html')
  getPrivacyPolicy(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Privacy Policy - ShopSync</title>
          <style>
              body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; color: #333; }
              h1 { color: #222; }
              p { margin-bottom: 20px; }
          </style>
      </head>
      <body>
          <h1>Privacy Policy for ShopSync</h1>
          <p>Last updated: February 11, 2026</p>
          <p>ShopSync ("we", "our", or "us") provides AI-powered automation solutions for Facebook Pages. This Privacy Policy describes how we handle the information we receive through Facebook APIs.</p>
          
          <h2>1. Information We Collect</h2>
          <p>We receive public profile information, messages, and comments from users who interact with your connected Facebook Page. This data is used solely to provide automated AI responses and order management features.</p>
          
          <h2>2. How We Use Information</h2>
          <p>The information is used only to:</p>
          <ul>
              <li>Generate AI responses to customer queries.</li>
              <li>Track order details and customer history within the ShopSync dashboard.</li>
              <li>Improve the AI's response quality for your specific shop.</li>
          </ul>
          
          <h2>3. Data Sharing</h2>
          <p>We do not sell or share your data with third parties. Data is processed through secure AI providers (like Groq) only for the purpose of generating replies.</p>
          
          <h2>4. Data Retention</h2>
          <p>Information is stored as long as your shop is active on ShopSync. Users can request data deletion by contacting the shop owner or our support team.</p>
          
          <h2>Contact Us</h2>
          <p>If you have any questions, please contact us at support@shopsync.aixplore.me</p>
      </body>
      </html>
    `;
  }
}
