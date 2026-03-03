import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import { SystemConfigService } from '../superadmin/system-config.service';

@Injectable()
export class EmailService {
  private resend: Resend;
  private frontendUrl: string;
  private smtpFrom: string;

  constructor(private readonly systemConfigService: SystemConfigService) {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    this.smtpFrom = process.env.SMTP_FROM || 'ShopSync <no-reply@komolina.store>';
  }

  private async getTemplate(
    content: string,
    actionUrl?: string,
    actionText?: string,
    shopName?: string,
  ) {
    const config = (await this.systemConfigService.getConfig()) as any;
    const year = new Date().getFullYear();
    const displayShopName = shopName || config.emailSenderName || 'ShopSync';
    const logoUrl = `${this.frontendUrl}/logo.png`;

    let actionHtml = '';
    if (actionUrl) {
      actionHtml = `
      <table role="presentation" style="width:100%;border:0;border-spacing:0;margin-top:32px;">
          <tr>
              <td align="center">
                  <a href="${actionUrl}" style="display:inline-block;background-color:#3b82f6;color:#ffffff;padding:14px 28px;font-size:16px;font-weight:700;text-decoration:none;border-radius:12px;box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);">
                      ${actionText || 'Action'}
                  </a>
              </td>
          </tr>
      </table>`;
    }

    if (config.globalEmailTemplate) {
      let template = config.globalEmailTemplate;
      template = template.replace(/#CONTENT#/g, content);
      template = template.replace(/#ACTION_BUTTON#/g, actionHtml);
      template = template.replace(/#SHOP_NAME#/g, displayShopName);
      template = template.replace(/#YEAR#/g, year.toString());
      template = template.replace(/#DASHBOARD_URL#/g, this.frontendUrl);
      template = template.replace(/#LOGO_URL#/g, logoUrl);
      return template;
    }

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${displayShopName} Notification</title>
    <!--[if mso]>
    <style type="text/css">
      body, table, td, p, a { font-family: Arial, Helvetica, sans-serif !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; word-spacing:normal; background-color: #f4f4f5; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f4f4f5;">
        <table role="presentation" style="width:100%;border:0;border-spacing:0;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="width:100%;max-width:600px;border:0;border-spacing:0;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);">
                        <!-- Header -->
                        <tr>
                            <td align="center" style="padding: 32px 24px; background-color: #09090b; border-bottom: 1px solid #27272a;">
                                <a href="${this.frontendUrl}" style="text-decoration: none; display: inline-block;">
                                    <span style="color: #ffffff; font-size: 28px; font-weight: 900; letter-spacing: -0.05em; font-family: 'Inter', sans-serif;">ShopSync <span style="color: #3b82f6;">OS</span></span>
                                </a>
                                ${shopName ? `<p style="color: #a1a1aa; font-size: 14px; margin: 8px 0 0 0; font-weight: 500;">For ${shopName}</p>` : ''}
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 32px; color: #3f3f46; font-size: 16px; line-height: 1.6;">
                                ${content}
                                ${actionHtml}
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td align="center" style="padding: 32px 24px; background-color: #fafafa; border-top: 1px solid #f4f4f5;">
                                <p style="color: #71717a; font-size: 13px; margin: 0 0 8px 0;">
                                    This email was sent by <strong>ShopSync</strong> on behalf of <strong>${displayShopName}</strong>.
                                </p>
                                <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
                                    &copy; ${year} ShopSync OS. All rights reserved.
                                </p>
                                <div style="margin-top: 16px;">
                                    <a href="${this.frontendUrl}" style="color: #3b82f6; text-decoration: none; font-size: 12px; margin: 0 8px;">Dashboard</a>
                                    <span style="color: #d4d4d8;">|</span>
                                    <a href="${this.frontendUrl}/support" style="color: #3b82f6; text-decoration: none; font-size: 12px; margin: 0 8px;">Support</a>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;
  }

  private async sendEmail(to: string, subject: string, html: string, idempotencyKey?: string) {
    if (!to) return false;

    // Get sender branding from config
    const config = (await this.systemConfigService.getConfig()) as any;
    const fromName = config.emailSenderName || 'ShopSync Team';
    const emailToUse = config.smtpFrom || this.smtpFrom;
    const fromEmail = emailToUse.includes('<')
      ? emailToUse.match(/<([^>]+)>/)?.[1]
      : emailToUse;

    const formattedFrom = `${fromName} <${fromEmail}>`;

    if (config.emailProvider === 'SMTP') {
      try {
        const transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword,
          },
        });

        const info = await transporter.sendMail({
          from: formattedFrom,
          to,
          subject,
          html,
          replyTo: config.emailSupportContact || 'support@shopsync.ai',
        });
        console.log(`[EMAIL SMTP] Sent to ${to}, MessageId: ${info.messageId}`);
        return true;
      } catch (error) {
        console.error(`[SMTP ERROR] Failed to send email to ${to}:`, error);
        return false;
      }
    }

    const { data, error } = await this.resend.emails.send({
      from: formattedFrom,
      to,
      subject,
      html,
      replyTo: config.emailSupportContact || 'support@shopsync.ai',
    }, idempotencyKey ? { idempotencyKey } : undefined);

    if (error) {
      console.error(`[RESEND ERROR] Failed to send email to ${to}:`, error);
      return false;
    }

    console.log(`[EMAIL RESEND] Sent to ${to}, ID: ${data?.id}`);
    return true;
  }

  async sendResetPasswordEmail(to: string, token: string) {
    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;
    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Reset Your Password</h1>
      <p style="margin: 0 0 16px 0;">Hello,</p>
      <p style="margin: 0 0 16px 0;">We received a request to reset your password for your ShopSync account. If you didn't make this request, you can safely ignore this email.</p>
      <p style="margin: 0;">To set a new password, click the button below:</p>`;
    return this.sendEmail(to, 'Reset your ShopSync password', await this.getTemplate(content, resetLink, 'Reset Password'), `reset-password/${token}`);
  }

  async sendVerificationEmail(to: string, token: string) {
    const verificationLink = `${this.frontendUrl}/verify-email?token=${token}`;
    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Verify Your Email</h1>
      <p style="margin: 0 0 16px 0;">Welcome to ShopSync OS! We're excited to have you on board. Please verify your email address to complete your registration and start managing your shop.</p>
      <p style="margin: 0;">Click the button below to verify:</p>`;
    return this.sendEmail(to, 'Verify your ShopSync account', await this.getTemplate(content, verificationLink, 'Verify Email'), `verify-email/${token}`);
  }

  async sendWelcomeMerchant(to: string, shopName: string) {
    const config = (await this.systemConfigService.getConfig()) as any;
    if (!config.enableMerchantEmails) return false;

    const dashboardLink = `${this.frontendUrl}/dashboard`;
    let content = '';

    if (config.welcomeEmailBody) {
      content = config.welcomeEmailBody.replace(/#SHOP_NAME#/g, shopName);
    } else {
      content = `
      <h1 style="color: #18181b; font-size: 26px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Welcome to ShopSync, ${shopName}! 🚀</h1>
      <p style="margin: 0 0 24px 0;">Your shop is now live and your AI assistant is ready to start processing orders. We've automatically activated your <strong>Pro Trial</strong> so you can experience our full suite of automation features.</p>
      
      <div style="background-color: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px 0; color: #18181b; font-size: 18px; font-weight: 700;">Next Steps:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #3f3f46;">
            <li style="margin-bottom: 8px;">Sync your products to the system</li>
            <li style="margin-bottom: 8px;">Set up your delivery regions</li>
            <li style="margin-bottom: 0;">Test your AI in the Messenger simulator</li>
        </ul>
      </div>
      
      <p style="margin: 0; font-weight: 500;">Let's build something amazing together!</p>`;
    }

    const subject = config.welcomeEmailSubject || `Welcome to the future of commerce, ${shopName}! 🚀`;
    return this.sendEmail(to, subject, await this.getTemplate(content, dashboardLink, 'Go to Dashboard', shopName), `welcome-merchant/${to}`);
  }

  async sendNewShopSignupAlert(shopData: any) {
    const config = (await this.systemConfigService.getConfig()) as any;
    if (!config.enableAdminAlerts) return false;

    const superAdminEmail = process.env.SUPERADMIN_EMAIL || 'admin@komolina.store';
    let content = '';

    if (config.adminAlertEmailBody) {
      content = config.adminAlertEmailBody
        .replace(/#SHOP_NAME#/g, shopData.name || '')
        .replace(/#EMAIL#/g, shopData.email || '');
    } else {
      content = `
      <h1 style="color: #18181b; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">New Shop Signed Up! 🏢</h1>
      
      <div style="background-color: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; color: #71717a; width: 100px;">Shop:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #18181b;">${shopData.name}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; color: #71717a;">Owner:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #18181b;">${shopData.ownerName}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; color: #71717a;">Email:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e4e4e7; font-weight: 600; color: #18181b;">${shopData.email}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #71717a;">Platform:</td>
                <td style="padding: 8px 0; font-weight: 600; color: #18181b;">Facebook (${shopData.pageId || 'No Page linked yet'})</td>
            </tr>
        </table>
      </div>`;
    }

    const subject = config.adminAlertEmailSubject || `🏢 New Shop Signup: ${shopData.name}`;
    return this.sendEmail(superAdminEmail, subject, await this.getTemplate(content), `admin-new-shop/${shopData.id}`);
  }

  async sendNewOrderAlert(to: string, order: any, shopName: string) {
    const config = (await this.systemConfigService.getConfig()) as any;
    if (!config.enableMerchantEmails) return false;

    const orderLink = `${this.frontendUrl}/orders/${order.id}`;
    const orderIdShort = order.id.slice(0, 8).toUpperCase();

    // Parse items if they are stringified
    let items = order.items;
    try { if (typeof items === 'string') items = JSON.parse(items); } catch (e) { }

    const itemListHtml = Array.isArray(items) ? `
      <div style="margin: 20px 0; border-top: 1px solid #e4e4e7; padding-top: 16px;">
        ${items.map((item: any) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
            <span style="color: #3f3f46; font-weight: 500;">${item.name} <span style="color: #a1a1aa;">x${item.quantity}</span></span>
            <span style="color: #18181b; font-weight: 600;">${item.price * item.quantity} BDT</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    let content = '';
    if (config.newOrderEmailBody) {
      content = config.newOrderEmailBody
        .replace(/#SHOP_NAME#/g, shopName || '')
        .replace(/#ID#/g, orderIdShort)
        .replace(/#TOTAL#/g, `${order.totalPrice} BDT`);

      // Inject items if mentioned, or just append
      if (content.includes('#ITEMS#')) {
        content = content.replace(/#ITEMS#/g, itemListHtml);
      } else {
        content += itemListHtml; // Attach it anyway so they see order details
      }
    } else {
      content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">New Order Received! 🛍️</h1>
      <p style="margin: 0 0 24px 0;">You have a new order from <strong>${order.customerName}</strong>.</p>
      
      <div style="background-color: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 16px; padding: 24px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 14px; color: #71717a; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;">Order #${orderIdShort}</span>
            <span style="background-color: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700;">New</span>
        </div>
        ${itemListHtml}
        <div style="border-top: 2px dashed #d4d4d8; margin-top: 16px; padding-top: 16px; display: flex; justify-content: space-between; font-weight: 800; color: #18181b; font-size: 18px;">
          <span>Total Amount:</span>
          <span style="color: #3b82f6;">${order.totalPrice} BDT</span>
        </div>
      </div>`;
    }

    const subject = (config.newOrderEmailSubject || 'New Order Received! 🛍️').replace('#ID#', orderIdShort);
    return this.sendEmail(to, subject, await this.getTemplate(content, orderLink, 'View Order', shopName), `new-order-alert/${order.id}`);
  }

  async sendOrderConfirmation(to: string, order: any, shopName: string) {
    const orderIdShort = order.id.slice(0, 8).toUpperCase();

    let items = order.items;
    try { if (typeof items === 'string') items = JSON.parse(items); } catch (e) { }

    const itemListHtml = Array.isArray(items) ? `
      <div style="margin: 20px 0; border-top: 1px solid #e4e4e7; padding-top: 16px;">
        ${items.map((item: any) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px;">
            <span style="color: #3f3f46; font-weight: 500;">${item.name} <span style="color: #a1a1aa;">x${item.quantity}</span></span>
            <span style="color: #18181b; font-weight: 600;">${item.price * item.quantity} BDT</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Order Confirmed! ✅</h1>
      <p style="margin: 0 0 24px 0;">Hello ${order.customerName}, thank you for shopping with ${shopName}. Your order <strong>#${orderIdShort}</strong> has been received and is being processed.</p>
      
      <div style="border: 1px solid #e4e4e7; background-color: #ffffff; border-radius: 16px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <h4 style="margin: 0 0 16px 0; color: #18181b; font-size: 16px; font-weight: 700;">Order Summary</h4>
        ${itemListHtml}
        <div style="border-top: 2px dashed #d4d4d8; margin-top: 16px; padding-top: 16px; display: flex; justify-content: space-between; font-weight: 800; color: #18181b; font-size: 18px;">
          <span>Total:</span>
          <span>${order.totalPrice} BDT</span>
        </div>
        
        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e4e4e7;">
            <h5 style="margin: 0 0 8px 0; color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;">Shipping to:</h5>
            <p style="margin: 0; font-size: 14px; color: #3f3f46; line-height: 1.5;">${order.customerAddress}</p>
        </div>
      </div>`;
    return this.sendEmail(to, `✅ Your ${shopName} order #${orderIdShort} is confirmed!`, await this.getTemplate(content, undefined, undefined, shopName), `order-confirmation/${order.id}`);
  }

  async sendOrderCancelled(to: string, order: any, shopName: string) {
    const orderIdShort = order.id.slice(0, 8).toUpperCase();
    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: #fee2e2; color: #ef4444; width: 64px; height: 64px; border-radius: 32px; line-height: 64px; font-size: 32px; margin-bottom: 16px;">✕</div>
        <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.025em;">Order Cancelled</h1>
        <p style="color: #71717a; margin: 0;">Order #${orderIdShort}</p>
      </div>
      <p style="margin: 0 0 16px 0;">Hello ${order.customerName}, your order has been cancelled.</p>
      <p style="margin: 0;">If you didn't request this or have questions, please reach out to us by replying to our messages on Facebook.</p>`;
    return this.sendEmail(to, `🚫 Order #${orderIdShort} Cancelled - ${shopName}`, await this.getTemplate(content, undefined, undefined, shopName), `order-cancelled/${order.id}`);
  }

  async sendOrderReturned(to: string, order: any, shopName: string) {
    const orderIdShort = order.id.slice(0, 8).toUpperCase();
    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Return Received 📦</h1>
      <p style="margin: 0 0 16px 0;">Hello ${order.customerName}, we have received the returned items for order <strong>#${orderIdShort}</strong>.</p>
      <div style="background-color: #f4f4f5; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; color: #3f3f46; font-size: 14px;">Our team will process any necessary refunds or exchanges within <strong style="color: #18181b;">3-5 business days</strong>.</p>
      </div>`;
    return this.sendEmail(to, `📦 Return Processed for Order #${orderIdShort}`, await this.getTemplate(content, undefined, undefined, shopName), `order-returned/${order.id}`);
  }

  async sendLowStockAlert(to: string, shopName: string, product: any) {
    const config = (await this.systemConfigService.getConfig()) as any;
    if (!config.enableMerchantEmails) return false;

    const productsLink = `${this.frontendUrl}/products`;
    let content = '';

    if (config.lowStockEmailBody) {
      content = config.lowStockEmailBody
        .replace(/#PRODUCT#/g, product.name || '')
        .replace(/#SHOP_NAME#/g, shopName || '');
    } else {
      content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Low Stock Alert ⚠️</h1>
      <p style="margin: 0 0 24px 0;">The following product is running low or out of stock:</p>
      
      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: 800; color: #92400e;">${product.name}</p>
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px; color: #b45309;">Current Stock:</span>
            <span style="background-color: #fef3c7; color: #b45309; padding: 4px 12px; border-radius: 999px; font-size: 14px; font-weight: 800;">${product.stock} units</span>
        </div>
      </div>
      
      <p style="margin: 0; color: #3f3f46;">Restock soon to avoid missing out on potential sales!</p>`;
    }

    const subject = (config.lowStockEmailSubject || '⚠️ Low Stock Alert').replace('#PRODUCT#', product.name);
    return this.sendEmail(to, subject, await this.getTemplate(content, productsLink, 'Manage Inventory', shopName), `low-stock/${product.id}/${product.stock}`);
  }

  async sendShippingUpdate(to: string, order: any, shopName: string, trackingUrl?: string) {
    const orderIdShort = order.id.slice(0, 8).toUpperCase();
    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Your Package is on the Way! 🚚</h1>
      <p style="margin: 0 0 24px 0;">Great news ${order.customerName}! Your order <strong>#${orderIdShort}</strong> has been shipped via <strong>${order.courierName || 'Partner Courier'}</strong>.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #166534; font-weight: 700;">Tracking ID</p>
        <p style="margin: 0; font-size: 20px; font-weight: 900; color: #15803d; letter-spacing: 2px;">${order.trackingId || 'See details'}</p>
      </div>
      
      <p style="margin: 0; color: #3f3f46;">You should receive it within 2-3 business days.</p>`;
    return this.sendEmail(to, `🚚 Your ${shopName} order #${orderIdShort} has shipped!`, await this.getTemplate(content, trackingUrl, 'Track Your Order', shopName), `shipping-update/${order.id}/${order.status}`);
  }

  async sendPaymentReceived(to: string, amount: number, transactionId: string, shopName: string) {
    const content = `
      <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Payment Proof Received 📥</h1>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">Amount Received</p>
        <p style="margin: 0 0 16px 0; font-size: 32px; font-weight: 900; color: #18181b;">${amount} BDT</p>
        <div style="display: inline-block; background-color: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-size: 12px; color: #475569; font-family: monospace;">
            TrxID: ${transactionId}
        </div>
      </div>
      
      <p style="margin: 0;">Our team will verify the transaction within 24 hours. Your subscription will be activated automatically once verified.</p>`;
    return this.sendEmail(to, `📥 Payment Proof Received - TrxID: ${transactionId}`, await this.getTemplate(content, undefined, undefined, shopName), `payment-received/${transactionId}`);
  }

  async sendSubscriptionActivated(to: string, plan: string) {
    const content = `
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; background-color: #fef08a; padding: 16px; border-radius: 32px; margin-bottom: 16px; box-shadow: 0 4px 14px 0 rgba(250, 204, 21, 0.39);">
            <span style="font-size: 32px;">✨</span>
        </div>
        <h1 style="color: #18181b; font-size: 28px; font-weight: 900; margin: 0 0 8px 0; letter-spacing: -0.025em;">Subscription Activated!</h1>
        <p style="color: #71717a; margin: 0; font-size: 16px;">Welcome to the premium experience.</p>
      </div>
      
      <p style="margin: 0 0 16px 0;">Your payment has been verified and your <strong style="color: #3b82f6; font-size: 18px;">${plan}</strong> plan is now active.</p>
      <p style="margin: 0;">All subscription features are now unlocked for your shop. Get ready to automate everything!</p>`;
    return this.sendEmail(to, `✨ Your ShopSync ${plan} Plan is now Active!`, await this.getTemplate(content, this.frontendUrl, 'Go to Dashboard', undefined), `sub-activated/${to}/${plan}/${new Date().toISOString().slice(0, 7)}`);
  }

  async sendPaymentRejected(to: string, reason: string) {
    const content = `
      <h1 style="color: #ef4444; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Payment Verification Failed ❌</h1>
      <p style="margin: 0 0 16px 0;">We couldn't verify your recent payment submission.</p>
      
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #991b1b; text-transform: uppercase;">Reason</p>
        <p style="margin: 0; color: #7f1d1d; font-weight: 500;">${reason}</p>
      </div>
      
      <p style="margin: 0;">Please double check your transaction details and submit again in the billing section.</p>`;
    return this.sendEmail(to, `❌ Payment Verification Failed`, await this.getTemplate(content, `${this.frontendUrl}/billing`, 'Review Payment', undefined));
  }

  async sendTrialExpiryReminder(to: string, daysLeft: number) {
    const content = `
      <h1 style="color: #ea580c; font-size: 24px; font-weight: 800; margin-top: 0; margin-bottom: 16px; letter-spacing: -0.025em;">Trial Ending Soon! ⏳</h1>
      
      <div style="background-color: #fff7ed; border: 1px solid #ffedd5; border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 8px 0; color: #9a3412; font-size: 14px; font-weight: 600;">ShopSync Pro Trial expires in</p>
        <p style="margin: 0; font-size: 36px; font-weight: 900; color: #c2410c;">${daysLeft} day${daysLeft > 1 ? 's' : ''}</p>
      </div>
      
      <p style="margin: 0 0 16px 0;">Don't lose access to voice-to-text, auto-courier booking, and non-stop AI order processing.</p>
      <p style="margin: 0; font-weight: 600; color: #18181b;">Upgrade now to keep your shop running at full power!</p>`;
    return this.sendEmail(to, `⏳ Your ShopSync Trial expires in ${daysLeft} days!`, await this.getTemplate(content, `${this.frontendUrl}/billing`, 'Upgrade Plan', undefined));
  }

  async sendTrialExpired(to: string) {
    const content = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: #f4f4f5; color: #3f3f46; width: 64px; height: 64px; border-radius: 32px; line-height: 64px; font-size: 24px; margin-bottom: 16px;">🔒</div>
        <h1 style="color: #18181b; font-size: 24px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.025em;">Trial Expired</h1>
      </div>
      <p style="margin: 0 0 16px 0; text-align: center;">Your ShopSync Pro Trial has expired and your account has been moved to the Free plan. AI order processing and premium features are currently restricted.</p>
      <p style="margin: 0; text-align: center; font-weight: 600;">Upgrade now to reactivate your AI assistant and continue Growing.</p>`;
    return this.sendEmail(to, `🔒 Your ShopSync Trial has Expired`, await this.getTemplate(content, `${this.frontendUrl}/billing`, 'Choose a Plan', undefined));
  }

}
