import { Controller, Get } from '@nestjs/common';
import { SystemConfigService } from './system-config.service';

@Controller('config')
export class PublicConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get('public')
  async getPublicConfig() {
    const config = await this.systemConfigService.getConfig();
    return {
      trialDays: config.trialDays,
      monthlyPrice: config.monthlyPrice,
    };
  }
}
