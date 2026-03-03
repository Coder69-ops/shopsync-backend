import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemConfigService } from '../superadmin/system-config.service';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private configService: SystemConfigService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 1. Bypass check for Auth & Super Admin routes
    if (
      request.url.includes('/auth/') ||
      request.url.startsWith('/api/super-admin') ||
      request.url.startsWith('/super-admin')
    ) {
      return true;
    }

    // 2. Allow SuperAdmin to bypass maintenance mode if user is already populated (optional backup)
    if (
      user &&
      (user.role === 'SUPERADMIN' || user.email === 'admin@shopsync.com')
    ) {
      return true;
    }

    // 2. Check Global Config
    const config = await this.configService.getConfig();
    if (config.maintenanceMode) {
      throw new ServiceUnavailableException({
        message:
          config.broadcastMessage ||
          'System is under maintenance. We will be back shortly.',
        error: 'MAINTENANCE_MODE',
        statusCode: 503,
      });
    }

    return true;
  }
}
