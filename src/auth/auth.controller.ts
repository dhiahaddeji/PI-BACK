import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFiles,
  UnauthorizedException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

const profileFileFilter = (_req: any, file: any, cb: any) => {
  const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const cvTypes = ['application/pdf'];

  if (file.fieldname === 'photo') {
    if (photoTypes.includes(file.mimetype)) return cb(null, true);
    return cb(new BadRequestException('Format photo invalide.'), false);
  }

  if (file.fieldname === 'cv') {
    if (cvTypes.includes(file.mimetype)) return cb(null, true);
    return cb(new BadRequestException('Format CV invalide.'), false);
  }

  return cb(new BadRequestException('Champ de fichier non autorisé.'), false);
};

const uploadStorage = (folder: string) =>
  diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(process.cwd(), 'uploads', folder);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const userId = (req as any).user?.userId || 'unknown';
      cb(null, `${userId}-${Date.now()}${extname(file.originalname)}`);
    },
  });

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private mailService: MailService,
  ) {}

  private setRefreshCookie(
    res: Response,
    refreshToken: string,
    expiresAt?: Date,
  ) {
    if (!refreshToken) return;
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/auth/refresh',
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie('refreshToken', { path: '/auth/refresh' });
  }

  private getRefreshToken(req: any, bodyToken?: string) {
    return bodyToken || req.cookies?.refreshToken;
  }

  // ── Test email (diagnostic) ───────────────────────────────────────

  @Get('test-email')
  async testEmail(@Request() req) {
    const to = req.query?.to || process.env.EMAIL_USER;
    return this.mailService.sendTestEmail(to);
  }

  // ── Email / password ──────────────────────────────────────────────

  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('login')
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body.email, body.password);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('refresh')
  async refresh(
    @Body() body: RefreshTokenDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getRefreshToken(req, body.refreshToken);
    if (!refreshToken) throw new UnauthorizedException('Refresh token manquant');
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req) {
    return req.user;
  }

  // ── GitHub OAuth ──────────────────────────────────────────────────

  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {
    // NestJS / Passport redirige automatiquement vers GitHub
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Request() req, @Res() res) {
    const { accessToken, refreshToken, refreshTokenExpiresAt, user } = req.user;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    this.setRefreshCookie(res, refreshToken, refreshTokenExpiresAt);

    // Transmet le token et l'utilisateur via query params (encodés en base64)
    const userEncoded = Buffer.from(JSON.stringify(user)).toString('base64');
    res.redirect(
      `${frontendUrl}/auth/callback?token=${accessToken}&user=${userEncoded}`,
    );
  }

  // ── Changement de mot de passe (première connexion) ───────────────

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Request() req,
    @Body() body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    this.clearRefreshCookie(res);
    return this.authService.logout(req.user.userId);
  }

  // ── Complétion du profil ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('complete-profile')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'cv', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (req, file, cb) => {
            const folder = file.fieldname === 'photo' ? 'avatars' : 'cvs';
            const dir = join(process.cwd(), 'uploads', folder);
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (req, file, cb) => {
            const userId = (req as any).user?.userId || 'unknown';
            cb(null, `${userId}-${Date.now()}${extname(file.originalname)}`);
          },
        }),
        fileFilter: profileFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      },
    ),
  )
  async completeProfile(
    @Request() req,
    @Body() body: CompleteProfileDto,
    @UploadedFiles() files: { photo?: any[]; cv?: any[] },
  ) {
    const userId = req.user.userId;
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';

    const updateData: any = {
      firstName: body.firstName,
      lastName: body.lastName,
      name: `${body.firstName} ${body.lastName}`,
      isProfileComplete: true,
    };

    if (body.telephone) updateData.telephone = body.telephone;

    if (files?.photo?.[0]) {
      const folder = 'avatars';
      updateData.photoUrl = `${baseUrl}/uploads/${folder}/${files.photo[0].filename}`;
    }

    if (files?.cv?.[0]) {
      updateData.cvUrl = `${baseUrl}/uploads/cvs/${files.cv[0].filename}`;
    }

    const updated = await this.usersService.update(userId, updateData);

    return {
      message: 'Profil complété avec succès.',
      user: {
        userId: updated._id,
        name: updated.name,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        role: updated.role,
        photoUrl: updated.photoUrl,
        mustChangePassword: updated.mustChangePassword,
        isProfileComplete: updated.isProfileComplete,
      },
    };
  }
}
