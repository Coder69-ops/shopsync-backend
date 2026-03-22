import { Processor } from '@nestjs/bullmq';
import { Processor as BullProcessor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FacebookCapiService } from './facebook-capi.service';

@BullProcessor('facebook-capi')
export class FacebookCapiProcessor extends WorkerHost {
  private readonly logger = new Logger(FacebookCapiProcessor.name);

  constructor(private readonly fbCapiService: FacebookCapiService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'send-start-trial') {
      this.logger.debug('Start processing Facebook CAPI StartTrial event...');
      try {
        const { userData, reqParams } = job.data;
        await this.fbCapiService.sendStartTrialEvent(userData, reqParams);
        this.logger.debug(
          'Successfully processed Facebook CAPI StartTrial event.',
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to process Facebook CAPI StartTrial event: ${error.message}`,
        );
        throw error;
      }
    }
  }
}
