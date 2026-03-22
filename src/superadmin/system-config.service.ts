import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SystemConfig } from '@prisma/client';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache: SystemConfig | null = null;
  private lastFetch: number = 0;
  private readonly TTL = 60 * 1000; // 1 Minute Cache

  constructor(
    private db: DatabaseService,
    private configService: ConfigService,
  ) {}

  async getConfig(): Promise<SystemConfig> {
    const now = Date.now();

    // Cache Hit
    if (this.cache && now - this.lastFetch < this.TTL) {
      return this.cache;
    }

    // Cache Miss - Fetch from DB
    let config = await this.db.systemConfig.findUnique({
      where: { id: 'global_config' },
    });

    // First time initialization if not exists
    if (!config) {
      this.logger.log('Initializing global system config...');
      config = await this.db.systemConfig.create({
        data: {
          id: 'global_config',
          globalPrompt:
            'You are an AI assistant for ShopSync, an e-commerce platform in Bangladesh. Help customers with their orders and inquiries in a helpful way. ALWAYS respond in valid JSON format when identifying orders or items.',
          activeAiModel: 'llama-3.3-70b-versatile',
          aiProvider: 'GROQ',
          aiApiKey: null,
          trialDays: 3,
          monthlyPrice: 3000,
          maintenanceMode: false,
          enableMerchantEmails: true,
          enableAdminAlerts: true,
          emailSenderName: 'ShopSync',
          emailSupportContact: 'support@komolina.store',
          lowStockThreshold: 5,
          welcomeEmailSubject: 'Welcome to ShopSync! 🚀',
          newOrderEmailSubject: 'New Order Received! 🛍️',
          lowStockEmailSubject: '⚠️ Low Stock Alert',
          adminAlertEmailSubject: 'New Shop Registration 🏢',
          adminAlertEmailBody:
            '<h1 style="margin-top:0;">New Registration</h1><div style="background: #f1f5f9; border-radius: 12px; padding: 20px;"><p style="margin: 0;"><strong>Email:</strong> #EMAIL#</p><p style="margin: 8px 0 0;"><strong>Shop Name:</strong> #SHOP_NAME#</p></div>',
          verifyEmailSubject: 'Verify your ShopSync account',
          verifyEmailBody:
            '<h1 style="margin-top:0; font-size: 28px; font-weight: 700;">Account Verification</h1><p>Hello #USER_NAME#,<br/><br/>Please verify your account by clicking the button below:</p><div style="text-align: center; margin-top: 32px;"><a href="#VERIFY_LINK#" class="btn">Verify Email</a></div>',
          forgotPasswordEmailSubject: 'Reset your ShopSync password',
          forgotPasswordEmailBody:
            '<h1 style="margin-top:0; font-size: 28px; font-weight: 700;">Password Reset</h1><p>Hello #USER_NAME#,<br/><br/>We received a request to reset your password. Click the button below to proceed:</p><div style="text-align: center; margin-top: 32px;"><a href="#RESET_LINK#" class="btn">Reset Password</a></div>',
        } as any,
      });
    }

    // Auto-fix deprecated models
    if (
      config.activeAiModel === 'llama3-70b-8192' ||
      config.activeAiModel === 'mixtral-8x7b-32768'
    ) {
      this.logger.warn(
        `Deprecated model ${config.activeAiModel} detected. Auto-migrating to llama-3.3-70b-versatile.`,
      );
      config = await this.db.systemConfig.update({
        where: { id: 'global_config' },
        data: { activeAiModel: 'llama-3.3-70b-versatile' },
      });
    }

    this.cache = config;
    this.lastFetch = now;
    return config;
  }

  async updateConfig(
    data: Partial<SystemConfig>,
    adminId: string,
  ): Promise<SystemConfig> {
    // 1. Validation: Don't break JSON instructions
    if (
      data.globalPrompt &&
      !data.globalPrompt.toUpperCase().includes('JSON')
    ) {
      throw new BadRequestException(
        "Safety Check Failed: Master Prompt MUST contain instructions for 'JSON' output to prevent system failure.",
      );
    }

    // 2. Perform Update
    const updated = await this.db.systemConfig.update({
      where: { id: 'global_config' },
      data,
    });

    // 3. Immediately update cache
    this.cache = updated;
    this.lastFetch = Date.now();

    this.logger.log(`System configuration updated by admin ${adminId}`);
    return updated;
  }

  // Force refresh the cache (useful after migrations if needed)
  async forceRefreshCache() {
    this.cache = null;
    this.lastFetch = 0;
    return this.getConfig();
  }

  async testAiConnection(
    provider: string,
    model: string,
    apiKeyOverride?: string,
  ): Promise<{
    success: boolean;
    latencyMs: number;
    response?: string;
    error?: string;
  }> {
    const start = Date.now();
    const testPrompt = 'Reply with exactly this JSON: {"ok":true}';

    try {
      let result: string;

      switch (provider) {
        case 'GROQ': {
          const apiKey =
            apiKeyOverride || this.configService.get<string>('GROQ_API_KEY');
          if (!apiKey) throw new Error('GROQ API key not configured');
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model,
              messages: [{ role: 'user', content: testPrompt }],
              response_format: { type: 'json_object' },
              temperature: 0,
              max_tokens: 20,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 15000,
            },
          );
          result = res.data.choices[0].message.content;
          break;
        }
        case 'OPENROUTER': {
          const apiKey =
            apiKeyOverride ||
            this.configService.get<string>('OPENROUTER_API_KEY');
          if (!apiKey) throw new Error('OpenRouter API key not configured');
          const res = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
              model,
              messages: [{ role: 'user', content: testPrompt }],
              response_format: { type: 'json_object' },
              temperature: 0,
              max_tokens: 20,
            },
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://shopsync.it.com',
                'X-Title': 'ShopSync',
              },
              timeout: 15000,
            },
          );
          result = res.data.choices[0].message.content;
          break;
        }
        case 'GOOGLE': {
          const apiKey =
            apiKeyOverride || this.configService.get<string>('GEMINI_API_KEY');
          if (!apiKey) throw new Error('Gemini API key not configured');
          const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
              generationConfig: {
                response_mime_type: 'application/json',
                temperature: 0,
                maxOutputTokens: 20,
              },
            },
            { timeout: 15000 },
          );
          result = res.data.candidates[0].content.parts[0].text;
          break;
        }
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      return {
        success: true,
        latencyMs: Date.now() - start,
        response: result.trim(),
      };
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Unknown error';
      return { success: false, latencyMs: Date.now() - start, error: message };
    }
  }
}
