import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionPlan } from '@prisma/client';

@Injectable()
export class SubscriptionGuard implements CanActivate {
    private readonly logger = new Logger(SubscriptionGuard.name);

    constructor(private reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            this.logger.warn('SubscriptionGuard: No user found in request');
            return false;
        }

        // specific check for FREE plan expiry
        if (user.role === 'SUPERADMIN') return true; // Superadmin bypass

        const isFullAccess = user.subscriptionTier === SubscriptionPlan.BASIC || user.subscriptionTier === SubscriptionPlan.PRO;

        if (isFullAccess) return true;

        // If Plan is FREE, check trial expiry
        if (user.subscriptionTier === SubscriptionPlan.FREE) {
            if (!user.trialEndsAt) {
                // If for some reason trialEndsAt is missing for FREE user, deny or allow? 
                // Let's assume they are expired if no date is set for FREE tier, to be safe/strict.
                this.logger.warn(`SubscriptionGuard: User ${user.id} has FREE plan but no trialEndsAt. Blocking.`);
                throw new ForbiddenException({
                    error: "Subscription Required",
                    code: "PAYWALL_LOCKED",
                    message: "Your trial configuration is invalid. Please contact support."
                });
            }

            const now = new Date();
            const trialEnds = new Date(user.trialEndsAt);

            if (now > trialEnds) {
                this.logger.warn(`SubscriptionGuard: User ${user.id} trial expired at ${trialEnds.toISOString()}`);
                throw new ForbiddenException({
                    error: "Subscription Required",
                    code: "PAYWALL_LOCKED",
                    message: "Your free trial has expired. Please upgrade to continue."
                });
            }
        }

        return true;
    }
}
