import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductService } from '../product/product.service';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';
import { SystemConfigService } from '../superadmin/system-config.service';
import { EmbeddingsService } from '../integration/embeddings.service';

export interface ShopWithPrompt {
  id: string;
  name?: string;
  systemPrompt?: string | null;
  aiConfig?: any;
  plan?: string;
  trialEndsAt?: Date | string | null;
}

export interface AiResponse {
  intent: 'CREATE_ORDER' | 'GENERAL_QUERY' | 'CHECK_STATUS';
  thought?: string;
  reply_message: string;
  data: {
    customer_name?: string | null;
    phone?: string | null;
    address?: string | null;
    items?: { product_name: string; quantity: number }[] | any; // Flexible for legacy or new structure
    total_price?: number;
    total_amount?: number;
    order_id?: string | null;
  };
  order_data?: {
    customer_name?: string | null;
    phone?: string | null;
    address?: string | null;
    items?: { product_name: string; quantity: number }[] | any;
    total_price?: number;
    total_amount?: number;
    delivery_charge?: number;
    order_id?: string | null;
  };
  confirmation_message?: string;
}

export interface CommentResponse {
  thought?: string;
  publicReply: string;
  privateReply: string;
  shouldSendDm: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private configService: ConfigService,
    private productService: ProductService,
    private readonly db: DatabaseService,
    private readonly systemConfigService: SystemConfigService,
    private readonly embeddingsService: EmbeddingsService
  ) { }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 2000,
    factor: number = 2,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (
        retries > 0 &&
        (error.response?.status === 429 || error.status === 429)
      ) {
        this.logger.warn(
          `Rate limit hit (429). Retrying in ${delay / 1000}s... (${retries} retries left)`,
        );
        await this.sleep(delay);
        return this.retryWithBackoff(fn, retries - 1, delay * factor, factor);
      }
      throw error;
    }
  }

  private async callAi(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    model?: string,
    jsonMode: boolean = true,
  ): Promise<any> {
    const config = await this.systemConfigService.getConfig();

    // Primary Configuration
    const activeModel = model || config.activeAiModel;
    const provider = config.aiProvider || 'GROQ';
    const activeApiKey = config.aiApiKey || undefined;

    // Backup Configuration
    const backupModel = config.backupAiModel;
    const backupProvider = config.backupAiProvider;
    const backupApiKey = config.backupAiApiKey || undefined;

    const executeProviderCall = async (p: string, m: string, key?: string) => {
      switch (p) {
        case 'GOOGLE':
          return this.callGeminiApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            key,
          );
        case 'OPENROUTER':
          return this.callOpenRouterApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            key,
          );
        case 'GROQ':
        default:
          return this.callGroqApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            key,
          );
      }
    };

    try {
      // Attempt Primary Provider
      return await this.retryWithBackoff(async () => {
        return executeProviderCall(provider, activeModel, activeApiKey);
      });
    } catch (error) {
      this.logger.error(
        `[PRIMARY AI FAILURE] Provider ${provider} model ${activeModel} failed: ${error.message}`,
      );

      // Attempt Backup Provider if Configured
      if (backupProvider && backupModel) {
        this.logger.warn(
          `[FAILOVER TRIGGERED] Routing request to secondary provider: ${backupProvider} (${backupModel})`,
        );
        try {
          return await this.retryWithBackoff(async () => {
            return executeProviderCall(
              backupProvider,
              backupModel,
              backupApiKey,
            );
          });
        } catch (backupError) {
          this.logger.error(
            `[BACKUP AI FAILURE] Provider ${backupProvider} model ${backupModel} also failed: ${backupError.message}`,
          );
          throw backupError; // Both failed
        }
      }

      throw error; // Primary failed, no backup configured
    }
  }

  private async callOpenRouterApi(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    model: string,
    jsonMode: boolean = true,
    apiKeyOverride?: string,
  ): Promise<any> {
    const apiKey =
      apiKeyOverride || this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: model,
        messages: messages,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://shopsync.it.com', // Required by OpenRouter
          'X-Title': 'ShopSync',
        },
      },
    );

    const content = response.data.choices[0].message.content;
    return jsonMode ? JSON.parse(content) : content;
  }

  private async callGroqApi(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    model: string,
    jsonMode: boolean = true,
    apiKeyOverride?: string,
  ): Promise<any> {
    const apiKey =
      apiKeyOverride || this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: model,
        messages: messages,
        response_format: jsonMode ? { type: 'json_object' } : undefined,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const content = response.data.choices[0].message.content;
    return jsonMode ? JSON.parse(content) : content;
  }

  private async callGeminiApi(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    userMessage: string,
    modelName: string,
    jsonMode: boolean = true,
    apiKeyOverride?: string,
  ): Promise<any> {
    const apiKey =
      apiKeyOverride || this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');

    const contents = history.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        contents,
        system_instruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          response_mime_type: jsonMode ? 'application/json' : 'text/plain',
          temperature: 0.3,
        },
      },
    );
    const contentText = response.data.candidates[0].content.parts[0].text;
    return jsonMode ? JSON.parse(contentText) : contentText;
  }

  private async buildSystemPrompt(
    shop: ShopWithPrompt,
    mode: 'chat' | 'comment' = 'chat',
    query?: string
  ): Promise<string> {
    let products: any[] = [];

    if (query) {
      const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
      if (queryEmbedding.length > 0) {
        const vectorString = `[${queryEmbedding.join(',')}]`;
        try {
          // Perform Cosine Distance (<=>) vector search
          products = await this.db.$queryRawUnsafe(`
            SELECT id, name, price, stock, description, type, platform, "externalUrl", "imageUrl" 
            FROM "Product" 
            WHERE "shopId" = $1
            ORDER BY "embedding" <=> $2::vector
            LIMIT 10;
          `, shop.id, vectorString);
        } catch (err) {
          this.logger.error(`Vector search failed: ${err}`);
          products = await this.db.product.findMany({ where: { shopId: shop.id }, take: 15, orderBy: { updatedAt: 'desc' } });
        }
      } else {
        products = await this.db.product.findMany({ where: { shopId: shop.id }, take: 15, orderBy: { updatedAt: 'desc' } });
      }
    } else {
      products = await this.db.product.findMany({ where: { shopId: shop.id }, take: 15, orderBy: { updatedAt: 'desc' } });
    }

    // Inventory Context with strict formatting
    // Differentiate between Physical and Service items
    const inventoryList =
      products.length > 0
        ? products
          .map((p: any) => {
            const typeTag = p.type === 'SERVICE' ? '[SERVICE]' : '[PRODUCT]';
            const details =
              p.type === 'SERVICE'
                ? `Fee: ${p.price} BDT | Description: ${p.description}`
                : `Price: ${p.price} BDT | Stock: ${p.stock}`;
            return `- ${typeTag} "${p.name}" | ${details} | ID: ${p.id}`;
          })
          .join('\n')
        : 'NO PRODUCTS AVAILABLE. APOLOGIZE TO USER.';

    const aiConfig = shop.aiConfig || {};
    const deliveryInside = aiConfig.deliveryChargeInside || '80';
    const deliveryOutside = aiConfig.deliveryChargeOutside || '150';

    // Check for Service vs Physical presence
    const hasPhysical = products.some((p: any) => p.type !== 'SERVICE');
    const hasServices = products.some((p: any) => p.type === 'SERVICE');

    let businessRules = '';

    if (hasPhysical) {
      businessRules += `
      - For PHYSICAL items: You MUST collect Name, Phone Number, and Full Delivery Address.
      - Add Delivery Charge: Inside Dhaka ${deliveryInside} BDT, Outside ${deliveryOutside} BDT.`;
    }

    if (hasServices) {
      businessRules += `
      - For SERVICES: You MUST collect Name, Phone Number, and Preferred Date/Time for the service.
      - DO NOT ask for a delivery address for services.
      - DO NOT add any delivery charges for services. The total is just the service fee.
      - delivery_charge MUST be 0 in the JSON output.
      - Confirm the appointment time clearly.`;
    }

    // --- FETCH KNOWLEDGE BASE (Q&A) ---
    const qnaEntries = await this.db.knowledgeBase.findMany({
      where: { shopId: shop.id },
    });

    const qnaContext =
      qnaEntries.length > 0
        ? qnaEntries.map((e) => `Q: ${e.question}\nA: ${e.answer}`).join('\n\n')
        : 'No specific Q&A pairs provided.';

    // --- FETCH GLOBAL CONFIG ---
    const config = await this.systemConfigService.getConfig();
    const promptTemplate = config.globalPrompt || '';

    // --- INJECT VARIABLES ---
    let prompt = promptTemplate
      .replace(/{{SHOP_NAME}}/g, shop.name || 'Shop')
      .replace(/{{CURRENT_DATE}}/g, new Date().toLocaleDateString())
      .replace(/{{INVENTORY_LIST}}/g, inventoryList)
      .replace(/{{DELIVERY_INSIDE}}/g, deliveryInside.toString())
      .replace(/{{DELIVERY_OUTSIDE}}/g, deliveryOutside.toString())
      .replace(/{{KNOWLEDGE_BASE}}/g, qnaContext); // Support both {{KNOWLEDGE_BASE}} and appending

    // Inject Business Rules via a placeholder if it exists, otherwise append
    if (prompt.includes('{{BUSINESS_RULES}}')) {
      prompt = prompt.replace(/{{BUSINESS_RULES}}/g, businessRules);
    } else {
      prompt += `\n### DYNAMIC BUSINESS RULES\n${businessRules}`;
    }

    // Append Knowledge Base if the placeholder wasn't found in the master prompt
    if (!promptTemplate.includes('{{KNOWLEDGE_BASE}}')) {
      prompt += `\n\n### ADDITIONAL SHOP KNOWLEDGE (Q&A)\n${qnaContext}`;
    }

    // --- MODE SPECIFIC INSTRUCTIONS ---

    if (mode === 'comment') {
      prompt += `
      ### MODE: COMMENT REPLY
      User is commenting on a public post.
      - **Goal:** Drive them to Inbox (DM).
      - If they ask "Price", "PP", "Dam koto" -> Reply publicly: "Inbox check korun sir 📩" AND set 'shouldSendDm': true.
      - If they ask generic info -> Reply publicly.
      
      ### RESPONSE FORMAT (JSON ONLY):
      {
        "thought": "Brief reasoning here (e.g., User asked for price, need to DM)",
        "publicReply": "Short public reply text",
        "privateReply": "Detailed reply for inbox (e.g., The price is 1500 BDT...)",
        "shouldSendDm": true/false
      }
      `;
    } else {
      // CHAT MODE
      prompt += `
      ### MODE: INBOX CHAT & ORDER TAKING
      User is chatting privately. Your goal is to CLOSE THE SALE or BOOK THE SERVICE.

      ### FEW-SHOT EXAMPLES (Follow this style):
      
      User: "Ei watch tar dam koto?"
      AI Output: {
        "intent": "GENERAL_QUERY",
        "reply_message": "Sir, T900 Ultra Watch er dam matro 1200 taka! Stock a ache, nite chaile order korte paren. 😊",
        "data": {}
      }

      User: "Habib, 01711223344, Mirpur 10. Watch ta den."
      AI Output: {
        "intent": "CREATE_ORDER",
        "reply_message": "Order confirmed! T900 Watch pathiye dicchi Mirpur 10 a. Total: [Calculated Price + Delivery] BDT.",
        "data": {
          "customer_name": "Habib",
          "phone": "01711223344",
          "address": "Mirpur 10",
          "items": [{ "product_name": "T900 Ultra Smartwatch", "quantity": 1 }],
          "total_price": [Price + Delivery],
          "delivery_type": "inside"
        }
      }

      User: "Ami website design service ta nite chai. Amar number 01711... Kal sokal 10 tay kotha bolte chai."
      AI Output: {
        "intent": "CREATE_ORDER", 
        "reply_message": "Dhonnobad! Apnar Website Design service er booking request confirm kora hoyeche. Kal sokal 10 tay amader team apnar sathe jogajog korbe.",
        "data": {
          "customer_name": "Sir",
          "phone": "01711...",
          "address": "N/A", 
          "appointment_date": "Tomorrow 10:00 AM",
          "items": [{ "product_name": "Website Design", "quantity": 1 }],
          "total_price": 5000,
          "delivery_type": "inside" // Irrelevant for service but keep consistency
        }
      }

      User: "Lal ta den." (Missing Info)
      AI Output: {
        "intent": "GENERAL_QUERY",
        "reply_message": "Thik ache sir, Lal ta dewa jabe. Kindly apnar Phone number r Address ta din?",
        "data": {}
      }

      ### RESPONSE FORMAT (JSON ONLY, NO MARKDOWN BLOCK):
      {
        "intent": "CREATE_ORDER" | "GENERAL_QUERY" | "CHECK_STATUS",
        "thought": "Reasoning (e.g., User gave address but missing phone)",
        "reply_message": "The text to show the user",
        "data": {
           "customer_name": "string or null",
           "phone": "string or null",
           "address": "string or null",
           "appointment_date": "string or null (For Services)",
           "items": [{ "product_name": "string", "quantity": number }] or [],
           "total_price": number,
           "delivery_type": "inside" | "outside",
           "order_id": "string or null"
        }
      }
      `;
    }

    return prompt;
  }

  async processComment(
    commentText: string,
    postContext: string,
    shop: ShopWithPrompt,
  ): Promise<CommentResponse> {
    try {
      // AI Guard Level 2
      // Lazy Expiry Check
      const now = new Date();
      const isTrialExpired =
        shop.plan === 'PRO_TRIAL' &&
        shop.trialEndsAt &&
        now > new Date(shop.trialEndsAt);

      if (shop.plan === 'FREE' || isTrialExpired) {
        // Lazy Auto-Downgrade (Fire and Forget)
        if (isTrialExpired) {
          this.logger.warn(
            `[LAZY DOWNGRADE] Shop ${shop.id} trial expired (via Comment). Downgrading to FREE.`,
          );
          this.db.shop
            .update({
              where: { id: shop.id },
              data: { plan: 'FREE' },
            })
            .catch((e) =>
              this.logger.error('Failed to auto-downgrade shop', e),
            );
        }

        return {
          thought: 'Trial Expired',
          publicReply: 'Please contact us via Inbox.',
          privateReply: '[AI PAUSED] Trial Expired. Upgrade to resume.',
          shouldSendDm: true,
        };
      }

      this.logger.log(`Processing comment for shop ${shop.id}: ${commentText}`);
      const systemPrompt = await this.buildSystemPrompt(shop, 'comment', commentText);

      // Use dynamic AI call
      return await this.callAi(
        systemPrompt,
        [],
        `POST CONTEXT: ${postContext}\n\nCOMMENT: ${commentText}\n\nREPLY:`,
        undefined,
        true,
      );
    } catch (error) {
      this.logger.error('Error in AiService.processComment', error);
      return {
        thought: 'Fallback due to error',
        publicReply:
          "Interesting point! Why don't you message us to talk more?",
        privateReply: '',
        shouldSendDm: false,
      };
    }
  }

  async processMessage(
    userMessage: string,
    shop: ShopWithPrompt,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<AiResponse> {
    try {
      if (process.env.LOAD_TEST_MODE === 'true') {
        this.logger.log(`[LOAD TEST MODE] Bypassing AI processing for user Message: ${userMessage.substring(0, 30)}`);
        // Add a tiny artificial delay to simulate processing but significantly faster than real AI
        await this.sleep(100);
        return {
          intent: 'GENERAL_QUERY',
          reply_message: 'This is a mock AI response for load testing. Fast and cheap!',
          data: {}
        };
      }

      // AI Guard Level 2
      // Lazy Expiry Check
      const now = new Date();
      const isTrialExpired =
        shop.plan === 'PRO_TRIAL' &&
        shop.trialEndsAt &&
        now > new Date(shop.trialEndsAt);

      if (shop.plan === 'FREE' || isTrialExpired) {
        // Lazy Auto-Downgrade
        if (isTrialExpired) {
          this.logger.warn(
            `[LAZY DOWNGRADE] Shop ${shop.id} trial expired. Downgrading to FREE.`,
          );
          // Fire and forget update
          this.db.shop
            .update({
              where: { id: shop.id },
              data: { plan: 'FREE' },
            })
            .catch((e) =>
              this.logger.error('Failed to auto-downgrade shop', e),
            );

          // Since we don't have the user ID here easily without querying, we settle for Shop plan update or rely on valid Shop object passing.
          // Ideally, the caller should refresh the shop object next time.
        }

        return {
          intent: 'GENERAL_QUERY',
          reply_message:
            '[AI SYSTEM PAUSED] Your trial has ended. Please upgrade to Pro to resume.',
          data: {},
        };
      }

      this.logger.log(
        `Processing message for shop ${shop.id} (Gemini): ${userMessage}`,
      );

      // 1. Intent Mapping (Simple Heuristic for fast exit)
      if (
        userMessage.toLowerCase().includes('track') ||
        userMessage.toLowerCase().includes('order status')
      ) {
        return {
          intent: 'CHECK_STATUS',
          reply_message: 'To track your order, please provide your Order ID.',
          data: {},
        };
      }

      if (
        userMessage.toLowerCase().includes('human') ||
        userMessage.toLowerCase().includes('support')
      ) {
        return {
          intent: 'GENERAL_QUERY',
          reply_message:
            'I have notified a human agent. They will reply shortly.',
          data: {},
        };
      }

      // 2. Generate AI Response via dynamic call
      const systemPrompt = await this.buildSystemPrompt(shop, 'chat', userMessage);

      const aiResponse = await this.callAi(
        systemPrompt,
        history,
        userMessage,
        undefined,
        true,
      );
      return aiResponse;
    } catch (error) {
      this.logger.error(
        `Error processing message with AI (Gemini): ${error.message}`,
        error.response?.data || error.stack,
      );
      return {
        intent: 'GENERAL_QUERY',
        thought: 'Fallback due to error',
        reply_message:
          'Sorry, I am having trouble understanding right now. Can you please repeat?',
        data: {},
      };
    }
  }
}
