import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { UploadService } from '../upload/upload.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private uploadService: UploadService,
  ) { }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() signInDto: LoginDto) {
    return this.authService.signIn(signInDto.email, signInDto.password);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  signUp(
    @Body() registerDto: RegisterDto,
    @Req() req: any,
  ) {
    const rawIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const clientIp = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : Array.isArray(rawIp) ? rawIp[0].trim() : '';

    const reqDetails = {
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      sourceUrl: req.headers.referer || req.headers.origin || 'https://www.shopsync.it.com/',
      firstName: registerDto.firstName,
      lastName: registerDto.lastName,
      phone: registerDto.phone,
    };
    return this.authService.signUp(
      registerDto.email,
      registerDto.password,
      registerDto.shopName,
      reqDetails
    );
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('onboarding/complete')
  async completeOnboarding(
    @Body() data: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.authService.completeOnboarding(userId, data);
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() data: any) {
    return this.authService.resetPassword(data.token, data.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post('facebook')
  async facebookLogin(@Body('accessToken') accessToken: string) {
    return this.authService.facebookAuth(accessToken);
  }

  @Get('facebook/login')
  async facebookRedirect(@Res() res: Response) {
    const url = await this.authService.getFacebookAuthUrl();
    return res.redirect(url);
  }

  @Get('facebook/callback')
  async facebookCallback(@Query('code') code: string, @Res() res: Response) {
    try {
      const { access_token } = await this.authService.handleFacebookCallback(code);
      const frontendUrl = process.env.FRONTEND_URL || 'https://shopsync.studio';
      return res.redirect(`${frontendUrl}/login?token=${access_token}`);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://shopsync.studio';
      return res.redirect(`${frontendUrl}/login?error=facebook_auth_failed`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('tour/complete')
  async completeTour(@CurrentUser('id') userId: string) {
    return this.authService.markTourAsSeen(userId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('change-password')
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(userId, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('update-profile')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() body: { name?: string; phone?: string; profilePic?: string },
  ) {
    return this.authService.updateProfile(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Patch('update-preferences')
  async updatePreferences(
    @CurrentUser('id') userId: string,
    @Body() body: { themePreference?: string; languagePreference?: string; emailNotifications?: boolean },
  ) {
    return this.authService.updatePreferences(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProfileImage(@UploadedFile() file: any) {
    const url = await this.uploadService.uploadFile(file, 'profiles');
    return { url };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resendVerification(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }
}
