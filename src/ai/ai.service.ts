import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductService } from '../product/product.service';
import axios from 'axios';

export interface ShopWithPrompt {
  id: string;
  name?: string;
  systemPrompt?: string | null;
  aiConfig?: any;
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
  ) { }

  private async callGroqApi(
    messages: any[],
    model: string = 'llama-3.1-8b-instant', // Default Fast & Smart Model
    jsonMode: boolean = true
  ): Promise<any> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model,
          messages: messages,
          temperature: 0.5, // Balanced creativity and precision
          response_format: jsonMode ? { type: "json_object" } : undefined,
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      return jsonMode ? JSON.parse(content) : content;

    } catch (error) {
      this.logger.error(`Groq API Error: ${error.message}`, error.response?.data);
      throw error;
    }
  }

  private async buildSystemPrompt(shop: ShopWithPrompt, mode: 'chat' | 'comment' = 'chat'): Promise<string> {
    const products = await this.productService.findAll(shop.id);

    // Inventory Context with strict formatting
    const inventoryList = products.length > 0
      ? products.map((p: any) => `- Product: "${p.name}" | Price: ${p.price} BDT | Stock: ${p.stock} | ID: ${p.id}`).join('\n')
      : "NO PRODUCTS AVAILABLE. APOLOGIZE TO USER.";

    const aiConfig = shop.aiConfig || {};
    const deliveryCharge = aiConfig.deliveryCharge || '100';

    // --- BASE PROMPT ---
    let prompt = `
    ROLE: You are an intelligent Sales Agent for "${shop.name}".
    LANGUAGE: Mixed Bangla (Banglish) & English. Natural, polite, and professional.
    DATE: ${new Date().toLocaleDateString()}

    ### 1. INVENTORY (TRUTH SOURCE)
    You can ONLY sell items listed here. DO NOT invent products or prices.
    ${inventoryList}
    
    ### 2. SHOP RULES
    - Delivery Charge: ${deliveryCharge} BDT (Inside Dhaka/Outside Dhaka same unless specified).
    - Return Policy: 7 Days replacement warranty.
    - Payment: Cash on Delivery (COD).

    ### 3. CRITICAL INSTRUCTIONS
    - **Step 1 (Stock):** If Stock is 0, say "Sorry, currently out of stock".
    - **Step 2 (Extraction):** To confirm an order, you MUST have ALL 4 fields: Name, Phone, Address, and Item Name.
    - **Step 3 (Validation):** IF User says "Yes" or "Confirm" BUT you don't have Address/Phone -> DO NOT output 'CREATE_ORDER'. Instead, ask for the missing info.
    - **Step 4 (Format):** Output strictly valid JSON.
    `;

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
      User is chatting privately. Your goal is to CLOSE THE SALE.

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
        "reply_message": "Order confirmed! T900 Watch pathiye dicchi Mirpur 10 a. Total: 1300 BDT (with delivery).",
        "data": {
          "customer_name": "Habib",
          "phone": "01711223344",
          "address": "Mirpur 10",
          "items": [{ "product_name": "T900 Ultra Smartwatch", "quantity": 1 }],
          "total_price": 1300
        }
      }

      User: "Lal ta den." (Missing Info)
      AI Output: {
        "intent": "GENERAL_QUERY",
        "reply_message": "Thik ache sir, Lal ta dewa jabe. Kindly apnar Phone number r Address ta din?",
        "data": {}
      }

      ### RESPONSE FORMAT (JSON ONLY):
      {
        "intent": "CREATE_ORDER" | "GENERAL_QUERY" | "CHECK_STATUS",
        "thought": "Reasoning (e.g., User gave address but missing phone)",
        "reply_message": "The text to show the user",
        "data": {
           "customer_name": "string or null",
           "phone": "string or null",
           "address": "string or null",
           "items": [{ "product_name": "string", "quantity": number }] or [],
           "total_price": number,
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
    shop: ShopWithPrompt
  ): Promise<CommentResponse> {
    try {
      this.logger.log(`Processing comment for shop ${shop.id}: ${commentText}`);
      const systemPrompt = await this.buildSystemPrompt(shop, 'comment');

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `POST CONTEXT: ${postContext}\n\nCOMMENT: ${commentText}\n\nREPLY:` },
      ];

      // Use Fast Model for Comments
      return await this.callGroqApi(messages, 'llama-3.1-8b-instant', true);

    } catch (error) {
      this.logger.error('Error in AiService.processComment', error);
      return {
        thought: "Fallback due to error",
        publicReply: 'Interesting point! Why don\'t you message us to talk more?',
        privateReply: '',
        shouldSendDm: false
      };
    }
  }

  async processMessage(
    userMessage: string,
    shop: ShopWithPrompt,
    history: { role: 'user' | 'assistant'; content: string }[] = [],
  ): Promise<AiResponse> {
    try {
      this.logger.log(`Processing message for shop ${shop.id} (Groq): ${userMessage}`);

      // 1. Intent Mapping (Simple Heuristic for fast exit)
      if (userMessage.toLowerCase().includes('track') || userMessage.toLowerCase().includes('order status')) {
        return {
          intent: 'CHECK_STATUS',
          reply_message: "To track your order, please provide your Order ID.",
          data: {}
        };
      }

      if (userMessage.toLowerCase().includes('human') || userMessage.toLowerCase().includes('support')) {
        return {
          intent: 'GENERAL_QUERY',
          reply_message: "I have notified a human agent. They will reply shortly.",
          data: {}
        };
      }

      // 2. Generate AI Response via Groq Cloud
      const systemPrompt = await this.buildSystemPrompt(shop);

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      // Use Smart Model for Complex Orders
      const aiResponse = await this.callGroqApi(messages, 'llama-3.1-8b-instant', true);
      return aiResponse;

    } catch (error) {
      this.logger.error(`Error processing message with AI (Groq): ${error.message}`, error.response?.data || error.stack);
      return {
        intent: 'GENERAL_QUERY',
        thought: "Fallback due to error",
        reply_message: 'Sorry, I am having trouble understanding right now. Can you please repeat?',
        data: {}
      };
    }
  }
}
