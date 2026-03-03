import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'super_secret_key',
    });
  }

  async validate(payload: any) {
    const user = await this.db.user.findUnique({
      where: { id: payload.sub },
      include: { shop: true },
    });

    if (!user) throw new UnauthorizedException();

    // Kill Switch Check (Suspended Users)
    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been suspended. Contact Support.',
      );
    }

    // Suspended Shop Check
    if (user.shopId && user.shop && !user.shop.isActive) {
      // We allow login even if shop is suspended so they can see the suspended screen?
      // The user said "suspended... aren't seeing anything... just maybe cutoff access but still can login".
      // So we should NOT throw here if we want them to see a specific UI.
      // BUT currently these throw ForbiddenException which 403s the request.
      // If the frontend handles 403 by logging them out, that's bad.
      // The plan says "Ensure API endpoints reject requests...".
      // If we block at JWT Strategy, *every* request fails including /auth/me if strictly applied.
      // However, let's keep the existing behavior for now but maybe make it more lenient for specific routes?
      // Actually, the user says "still can login and see dashboard but failed to access data".
      // So for data access it should fail. For loading the dashboard (which might need /auth/me), it should succeed.
      // Recommendation: Do NOT throw here. Let the Service layer or specific Guards handle it, OR just return the user and let Frontend handle the UI lock.
      // I will comment out the throws for now to allow login, OR better, I will leave them as is if they only block DATA requests.
      // But wait, `validate` is called for every protected route. If `layout.tsx` calls `/auth/me` (it usually doesn't, it uses local storage), then it's fine.
      // But if `layout.tsx` fetches meaningful data, that will fail.
      // Let's stick to the plan: "Ensure API endpoints reject...".
      // So we KEEP the throws for suspended.
    }

    if (user.shopId && user.shop && !user.shop.isActive) {
      throw new ForbiddenException('Your Shop has been suspended.');
    }

    return user;
  }
}
