import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

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

  // ── Test email (diagnostic) ───────────────────────────────────────

  @Get('test-email')
  async testEmail(@Request() req) {
    const to = req.query?.to || process.env.EMAIL_USER;
    return this.mailService.sendTestEmail(to);
  }

  // ── Email / password ──────────────────────────────────────────────

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
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
    const { accessToken, user } = req.user;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

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
    @Body() body: { newPassword: string },
  ) {
    return this.authService.changePassword(req.user.userId, body.newPassword);
  }

  // ── Complétion du profil ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
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
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      },
    ),
  )
  async completeProfile(
    @Request() req,
    @Body() body: { firstName: string; lastName: string; telephone?: string },
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
