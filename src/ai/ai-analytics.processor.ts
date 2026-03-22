import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiService } from './ai.service';
import { subDays, startOfDay, endOfDay } from 'date-fns';

@Processor('ai-analytics-queue')
export class AiAnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAnalyticsProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(
      `Starting daily AI batch analysis for shop ${job.data.shopId}`,
    );
    const { shopId, days = 1 } = job.data;

    // Calculate dynamic date range
    // If days=1, we analyze 'yesterday' specifically to keep the 24h cycle clean for daily cron.
    // If days > 1 or specific manual trigger, we look at the last X days until now.
    let start: Date;
    let end: Date = new Date();

    if (days === 1) {
      const yesterday = subDays(new Date(), 1);
      start = startOfDay(yesterday);
      end = endOfDay(yesterday);
    } else {
      start = startOfDay(subDays(new Date(), days - 1));
    }

    try {
      // 1. Fetch all conversations and messages from yesterday for this shop
      const conversations = await this.db.conversation.findMany({
        where: {
          shopId,
          updatedAt: {
            gte: start,
            lte: end,
          },
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (conversations.length === 0) {
        this.logger.log(
          `No conversations found for shop ${shopId} yesterday. Skipping analysis.`,
        );
        return;
      }

      // 2. Format logs for AI analysis
      const logs = conversations.map((conv) => ({
        customerName: conv.customerName,
        tag: conv.tags,
        messages: conv.messages
          .map((msg) => `${msg.sender}: ${msg.content}`)
          .join('\n'),
      }));

      // 3. Prompt Gemini for Batch Analysis
      const systemPrompt = `
                You are a senior E-commerce Analyst for ShopSync. 
                Analyze the following chat logs from the last 24 hours and provide a JSON report.
                
                RESPONSE FORMAT (JSON ONLY):
                {
                    "highRiskOrders": [{"customerName": "name", "reason": "why risky"}],
                    "hagglingTrends": [{"product": "name", "rate": number}],
                    "lostSalesReasons": [{"reason": "reason", "impact": number}],
                    "commonQuestions": [{"question": "...", "frequency": "low/med/high"}],
                    "sentimentBreakdown": {"positive": number, "neutral": number, "negative": number},
                    "sentimentScore": number
                }
            `;

      const batchLogString = JSON.stringify(logs, null, 2);
      const analysisResult = await this.aiService.callAi(
        systemPrompt,
        [],
        `CHAT LOGS TO ANALYZE:\n${batchLogString}`,
        undefined,
        true,
      );

      // 4. Save to AiInsight table
      await (this.db as any).aiInsight.create({
        data: {
          shopId,
          type: 'BATCH_ANALYSIS',
          value: analysisResult,
          date: start,
        },
      });

      this.logger.log(`AI Batch analysis completed for shop ${shopId}`);
      return analysisResult;
    } catch (error) {
      this.logger.error(
        `Error in AiAnalyticsProcessor for shop ${shopId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
