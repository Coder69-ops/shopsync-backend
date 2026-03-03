import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('SubscriptionGuard: No user found in request');
      return false;
    }

    // specific check for FREE plan expiry
    if (user.role === 'SUPERADMIN') return true; // Superadmin bypass

    const plan = user.plan || 'FREE';
    const isFullAccess =
      plan === SubscriptionPlan.BASIC || plan === SubscriptionPlan.PRO;

    if (isFullAccess) return true;

    // If Plan is FREE or PRO_TRIAL, check trial expiry
    if (plan === SubscriptionPlan.FREE || plan === 'PRO_TRIAL') {
      if (!user.trialEndsAt) {
        // If for some reason trialEndsAt is missing for FREE user, allow for now?
        // Or deny if strictly necessary.
        return true;
      }

      const now = new Date();
      const trialEnds = new Date(user.trialEndsAt);

      if (now > trialEnds) {
        this.logger.warn(
          `SubscriptionGuard: User ${user.id} trial expired at ${trialEnds.toISOString()}`,
        );
        throw new ForbiddenException({
          error: 'Subscription Required',
          code: 'PAYWALL_LOCKED',
          message: 'Your free trial has expired. Please upgrade to continue.',
        });
      }
    }

    return true;
  }
}
