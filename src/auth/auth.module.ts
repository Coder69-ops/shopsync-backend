import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../email/email.module';
import { SystemConfigModule } from '../superadmin/system-config.module';
import { UploadModule } from '../upload/upload.module';
import { FacebookModule } from '../facebook/facebook.module';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'super_secret_key',
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
    EmailModule,
    SystemConfigModule,
    UploadModule,
    FacebookModule,
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule { }
