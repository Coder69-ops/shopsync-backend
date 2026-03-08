import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductService } from '../product/product.service';
import { DatabaseService } from '../database/database.service';
import axios from 'axios';
import { SystemConfigService } from '../superadmin/system-config.service';
import { EmbeddingsService } from '../integration/embeddings.service';
import { RedxService } from '../redx/redx.service';

export interface ShopWithPrompt {
  id: string;
  name?: string;
  systemPrompt?: string | null;
  aiConfig?: any;
  plan?: string;
  trialEndsAt?: Date | string | null;
  redxToken?: string | null;
  redxStoreId?: string | null;
}

export interface AiResponse {
  intent: 'CREATE_ORDER' | 'GENERAL_QUERY' | 'CHECK_STATUS' | 'CHECK_SHIPPING' | 'RETURN_ORDER';
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
    return_reason?: string | null;
    shipping_details?: any;
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
    shipping_details?: any;
  };
  shipping_details?: any;
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
    private readonly embeddingsService: EmbeddingsService,
    private readonly redxService: RedxService
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
          `Rate limit hit(429).Retrying in ${delay / 1000}s... (${retries} retries left)`,
        );
        await this.sleep(delay);
        return this.retryWithBackoff(fn, retries - 1, delay * factor, factor);
      }
      throw error;
    }
  }

  public async callAi(
    systemPrompt: string,
    history: { role: 'user' | 'assistant'; content: string; shipping_details?: any }[],
    userMessage: string,
    model?: string,
    jsonMode: boolean = true,
    key?: string,
  ): Promise<any> {
    const config = await this.systemConfigService.getConfig();

    // Primary Configuration
    const activeModel = model || config.activeAiModel;
    const provider = config.aiProvider || 'GROQ';
    const activeApiKey = key || config.aiApiKey || undefined;

    // Backup Configuration
    const backupModel = config.backupAiModel;
    const backupProvider = config.backupAiProvider;
    const backupApiKey = config.backupAiApiKey || undefined;

    const executeProviderCall = async (p: string, m: string, k?: string) => {
      switch (p) {
        case 'GOOGLE':
          return this.callGeminiApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            k,
          );
        case 'OPENROUTER':
          return this.callOpenRouterApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            k,
          );
        case 'GROQ':
        default:
          return this.callGroqApi(
            systemPrompt,
            history,
            userMessage,
            m,
            jsonMode,
            k,
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
        `[PRIMARY AI FAILURE] Provider ${provider} model ${activeModel} failed: ${error.message} `,
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
            `[BACKUP AI FAILURE] Provider ${backupProvider} model ${backupModel} also failed: ${backupError.message} `,
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
          Authorization: `Bearer ${apiKey} `,
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
          Authorization: `Bearer ${apiKey} `,
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

  public async buildSystemPrompt(
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

    // --- REDX LOGISTICS CAPABILITIES ---
    const redxToken = shop.redxToken;
    let logisticsInstructions = '';
    if (redxToken) {
      logisticsInstructions = `
      ### REDX LOGISTICS ENABLED
      You have access to real-time RedX shipping rates and area lookups.
      - **Tool: CHECK_SHIPPING**
        - Use this when: User asks for delivery charge/cost to a specific area OR you need to calculate total for an order but want exact RedX rates.
        - Required Data: 'area_name' (e.g., "Dhanmondi"), 'parcel_weight' (optional, in grams, default: 500).
        - How to trigger: Set 'intent' to 'CHECK_SHIPPING' and provide 'data.area_name' and 'data.parcel_weight' if known.
      - **Tool: CHECK_STATUS**
        - Use this when: User asks "Where is my order?", "Order update ki?", or provides an Order ID to track.
        - Required Data: 'order_id' or 'invoice_number' if provided.
        - How to trigger: Set 'intent' to 'CHECK_STATUS' and provide 'data.order_id'.
      - **Tool: RETURN_ORDER**
        - Use this when: User wants to return a delivered item or initiate reverse logistics.
        - Required Data: 'order_id' (if known) and 'return_reason'.
        - How to trigger: Set 'intent' to 'RETURN_ORDER' and provide 'data.order_id' and 'data.return_reason'.
      - **Area Validation:** If a user provides an address, try to identify the 'area_name' for logistics calculation.`;
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
      ${logisticsInstructions}

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
        "intent": "CREATE_ORDER" | "GENERAL_QUERY" | "CHECK_STATUS" | "CHECK_SHIPPING" | "RETURN_ORDER",
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
           "order_id": "string or null",
           "return_reason": "string or null",
           "area_name": "string or null"
        }
      }
      `;
    }

    return prompt;
  }

  private checkAndHandleTrialExpiry(shop: ShopWithPrompt): boolean {
    const now = new Date();
    const isTrialExpired =
      shop.plan === 'PRO_TRIAL' &&
      shop.trialEndsAt &&
      now > new Date(shop.trialEndsAt);

    if (shop.plan === 'FREE' || isTrialExpired) {
      if (isTrialExpired) {
        this.logger.warn(
          `[LAZY DOWNGRADE] Shop ${shop.id} trial expired. Downgrading to FREE.`,
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
      return true;
    }
    return false;
  }

  async processComment(
    commentText: string,
    postContext: string,
    shop: ShopWithPrompt,
  ): Promise<CommentResponse> {
    try {
      if (this.checkAndHandleTrialExpiry(shop)) {
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
      if (this.checkAndHandleTrialExpiry(shop)) {
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

      if (
        userMessage.toLowerCase().includes('return') ||
        userMessage.toLowerCase().includes('ferot') ||
        userMessage.toLowerCase().includes('refund')
      ) {
        // Let the AI handle it, but we can give a hint if we wanted.
      }

      // 2. Generate AI Response via dynamic call
      const systemPrompt = await this.buildSystemPrompt(shop, 'chat', userMessage);

      let aiResponse = await this.callAi(
        systemPrompt,
        history,
        userMessage,
        undefined,
        true,
      );

      // Handle Logistics Tool-use (Intent Loop)
      if (aiResponse.intent === 'CHECK_SHIPPING' && shop.redxToken) {
        aiResponse = await this.processLogisticsIntent(aiResponse, shop, userMessage, history);
      }

      // PERSISTENCE FIX: If we are now creating an order, check if we had shipping details in history
      if (aiResponse.intent === 'CREATE_ORDER') {
        const lastLogisticsMsg: any = [...history].reverse().find((m: any) => (m as any).shipping_details);
        if (lastLogisticsMsg?.shipping_details) {
          aiResponse.shipping_details = lastLogisticsMsg.shipping_details;
          this.logger.log(`Restored shipping details from history for order creation: ${JSON.stringify(aiResponse.shipping_details)}`);
        }
      }

      if (aiResponse.intent === 'CHECK_STATUS') {
        return await this.processTrackingIntent(aiResponse, shop, userMessage, history);
      }

      if (aiResponse.intent === 'RETURN_ORDER') {
        return await this.processReturnIntent(aiResponse, shop, userMessage, history);
      }

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

  private async processLogisticsIntent(
    aiResponse: any,
    shop: ShopWithPrompt,
    userMessage: string,
    history: any[],
  ): Promise<any> {
    const redxToken = shop.redxToken;
    if (!redxToken) return aiResponse;

    const areaName = aiResponse.data?.area_name;
    if (!areaName) return aiResponse;

    try {
      this.logger.log(`Performing RedX area lookup for: ${areaName}`);
      const areas = await this.redxService.getAreas(redxToken, areaName);

      if (areas && areas.length > 0) {
        const bestArea = areas[0];
        const weight = Number(aiResponse.data?.parcel_weight) || 500;
        const chargeData = await this.redxService.calculateCharge(bestArea.id, weight, redxToken);

        // Final Price / Charge
        const charge = chargeData?.delivery_charge || 60; // Fallback to 60 BDT if missing

        // Re-call AI with the specific logistics data to provide a natural response
        const logisticsContext = `
          ### REDX REAL-TIME DATA (INTERNAL ONLY - DO NOT SHOW AS JSON)
          - Area: ${bestArea.name} (Matched from user query "${areaName}")
          - Charge: ${charge} BDT
          - Estimated Delivery: ${chargeData?.estimated_delivery_time || '2-3 days'}
          
          Now respond to the user politely using this data. If they seem to be placing an order, encourage them to confirm.
        `;

        const basePrompt = await this.buildSystemPrompt(shop, 'chat', userMessage);
        const enrichedPrompt = `${basePrompt}\n\n${logisticsContext}`;

        const finalResponse = await this.callAi(
          enrichedPrompt,
          history,
          userMessage,
          undefined,
          true,
        );

        // Preserve the shipping details in the final JSON for order creation logic
        finalResponse.shipping_details = {
          area_id: bestArea.id,
          area_name: bestArea.name,
          charge: charge,
          etd: chargeData?.estimated_delivery_time,
        };

        return finalResponse;
      } else {
        aiResponse.reply_message += " (Note: We couldn't find a exact delivery area match in our courier service for your location. Please provide a major area name.)";
      }
    } catch (err) {
      this.logger.error(`Logistics processing failed: ${err.message}`);
    }

    return aiResponse;
  }

  private async processTrackingIntent(
    aiResponse: any,
    shop: ShopWithPrompt,
    userMessage: string,
    history: any[],
  ): Promise<any> {
    const orderId = aiResponse.data?.order_id;
    if (!orderId) {
      aiResponse.reply_message = "I'd be happy to help you track your order! Could you please provide your Order ID or Invoice Number?";
      return aiResponse;
    }

    try {
      this.logger.log(`Performing order lookup for tracking: ${orderId}`);

      const order = await this.db.order.findFirst({
        where: {
          shopId: shop.id,
          OR: [
            { id: { startsWith: orderId, mode: 'insensitive' } },
            { invoiceNumber: { contains: orderId, mode: 'insensitive' } },
            { trackingId: { contains: orderId, mode: 'insensitive' } }
          ]
        },
        include: { shop: true }
      });

      if (!order) {
        aiResponse.reply_message = `I couldn't find any order matching "${orderId}". Please double-check the ID and try again.`;
        return aiResponse;
      }

      let trackingContext = `### INTERNAL ORDER DATA\n- ID: ${order.id}\n- Status: ${order.status}\n`;

      if (order.trackingId && order.shop?.redxToken) {
        try {
          this.logger.log(`Fetching real-time RedX tracking for: ${order.trackingId}`);
          const trackData = await this.redxService.trackParcel(order.trackingId, order.shop.redxToken);
          trackingContext += `- Courier: RedX\n- Tracking ID: ${order.trackingId}\n- Courier Status: ${trackData?.parcel?.status || 'Unknown'}\n- Courier Message: ${trackData?.parcel?.message_en || 'Processing'}`;
        } catch (err) {
          this.logger.warn(`RedX tracking failed: ${err.message}`);
          trackingContext += `- Courier Status: Update unavailable (Service busy)`;
        }
      }

      const basePrompt = await this.buildSystemPrompt(shop, 'chat', userMessage);
      const enrichedPrompt = `${basePrompt}\n\n${trackingContext}\n\nNow respond to the user with their order status in a friendly way. Mention the tracking ID and last courier update if available.`;

      return await this.callAi(
        enrichedPrompt,
        history,
        userMessage,
        undefined,
        true
      );
    } catch (err) {
      this.logger.error(`Tracking processing failed: ${err.message}`);
      return aiResponse;
    }
  }

  private async processReturnIntent(
    aiResponse: any,
    shop: ShopWithPrompt,
    userMessage: string,
    history: any[],
  ): Promise<any> {
    const orderId = aiResponse.data?.order_id;
    const reason = aiResponse.data?.return_reason;

    if (!orderId) {
      aiResponse.reply_message = "I am sorry to hear you want to return an item. To help you with that, could you please provide your Order ID or Invoice Number?";
      return aiResponse;
    }

    try {
      this.logger.log(`Processing return request for order: ${orderId}`);

      const order = await this.db.order.findFirst({
        where: {
          shopId: shop.id,
          OR: [
            { id: { startsWith: orderId, mode: 'insensitive' } },
            { invoiceNumber: { contains: orderId, mode: 'insensitive' } },
            { trackingId: { contains: orderId, mode: 'insensitive' } }
          ]
        },
        include: { shop: true }
      });

      if (!order) {
        aiResponse.reply_message = `I couldn't find any order matching "${orderId}". Please make sure the number is correct.`;
        return aiResponse;
      }

      let returnContext = `### INTERNAL ORDER DATA\n- ID: ${order.id}\n- Current Status: ${order.status}\n`;
      let canReturn = false;

      // Generally, only Shipped or Delivered items are "Returned". Draft/Pending are "Cancelled".
      if (order.status === 'DELIVERED' || order.status === 'SHIPPED') {
        canReturn = true;

        // Update DB to mark as Return Requested (Using shipmentStatus as a flag)
        await this.db.order.update({
          where: { id: order.id },
          data: {
            shipmentStatus: 'RETURN_REQUESTED',
          }
        });

        // Also log this in conversation if possible, or we just rely on order status.
        this.logger.log(`Flagged order ${order.id} for Return Pickup. Reason: ${reason}`);

        returnContext += `- Action Taken: Return request logged successfully.\n- Instruction for AI: Tell the user that their return request has been submitted and a delivery agent will contact them within 2-3 days for pickup.`;
      } else if (order.status === 'PENDING' || order.status === 'CONFIRMED') {
        // They want to cancel before shipping
        canReturn = true;
        await this.db.order.update({
          where: { id: order.id },
          data: { status: 'CANCELLED' }
        });
        returnContext += `- Action Taken: Order was not shipped yet, so it has been CANCELLED instead of returned.\n- Instruction for AI: Tell the user the order was cancelled successfully and no delivery will take place.`;
      } else {
        returnContext += `- Action Taken: Cannot return an order in ${order.status} status.\n- Instruction for AI: Politely explain that this order cannot be returned right now because of its current status.`;
      }

      const basePrompt = await this.buildSystemPrompt(shop, 'chat', userMessage);
      const enrichedPrompt = `${basePrompt}\n\n${returnContext}\n\nNow respond to the user based on the action taken.`;

      return await this.callAi(
        enrichedPrompt,
        history,
        userMessage,
        undefined,
        true
      );
    } catch (err) {
      this.logger.error(`Return processing failed: ${err.message}`);
      aiResponse.reply_message = "I couldn't process your return request right now due to a system issue. Please try again later or contact human support.";
      return aiResponse;
    }
  }
}
