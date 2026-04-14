import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private auditLogsService: AuditLogsService,
    private configService: ConfigService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────

  private accessTokenTtl() {
    return this.configService.get<string>('JWT_ACCESS_TTL') || '15m';
  }

  private refreshTokenTtl() {
    return this.configService.get<string>('JWT_REFRESH_TTL') || '7d';
  }

  private refreshTokenSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'SECRET_KEY'
    );
  }

  private ttlToMs(ttl: string | number) {
    if (!ttl) return 0;
    if (typeof ttl === 'number') return ttl * 1000;
    const match = ttl.trim().match(/^(\d+)([smhd])?$/i);
    if (!match) return 0;
    const value = parseInt(match[1], 10);
    const unit = (match[2] || 's').toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 1000);
  }

  private extractExpiry(token: string, ttl: string) {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (decoded?.exp) return new Date(decoded.exp * 1000);
    return new Date(Date.now() + this.ttlToMs(ttl));
  }

  private buildAccessToken(user: any) {
    return this.jwtService.sign(
      {
        sub: user._id,
        name:
          user.name ||
          `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
          user.email,
        email: user.email,
        role: user.role,
        type: 'access',
      },
      { expiresIn: this.accessTokenTtl() as StringValue },
    );
  }

  private buildRefreshToken(user: any) {
    const ttl = this.refreshTokenTtl();
    const token = this.jwtService.sign(
      {
        sub: user._id,
        email: user.email,
        type: 'refresh',
      },
      { expiresIn: ttl as StringValue, secret: this.refreshTokenSecret() },
    );
    const expiresAt = this.extractExpiry(token, ttl);
    return { token, expiresAt };
  }

  private buildUserPayload(user: any) {
    return {
      userId: user._id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      photoUrl: user.photoUrl,
      mustChangePassword: user.mustChangePassword ?? false,
      isProfileComplete: user.isProfileComplete ?? false,
    };
  }

  // ── Email / password login ─────────────────────────────────────────

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Mot de passe incorrect');

    // Vérifier expiration du mot de passe temporaire
    if (user.passwordExpiresAt && new Date() > user.passwordExpiresAt) {
      throw new UnauthorizedException(
        'Votre mot de passe temporaire a expiré (24 h). Contactez l\'administrateur.',
      );
    }

    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    await this.usersService.updateOnlineStatus(user._id.toString(), true);

    const accessToken = this.buildAccessToken(user);
    const refreshBundle = this.buildRefreshToken(user);
    await this.usersService.setRefreshToken(
      user._id.toString(),
      refreshBundle.token,
      refreshBundle.expiresAt,
    );

    const firstName = (user as any).firstName || '';
    const lastName  = (user as any).lastName  || '';
    const userName  = (user as any).name
      || (firstName && lastName ? `${firstName} ${lastName}` : '')
      || email;

    this.auditLogsService.log({
      action: AuditAction.USER_LOGIN,
      userId: user._id.toString(),
      userName,
      userRole: (user as any).role,
      targetName: (user as any).matricule || email,
      details: {
        email: (user as any).email,
        matricule: (user as any).matricule || null,
        loginTime: new Date().toISOString(),
      },
    }).catch(() => {});

    return {
      accessToken,
      refreshToken: refreshBundle.token,
      refreshTokenExpiresAt: refreshBundle.expiresAt,
      user: this.buildUserPayload(user),
    };
  }

  // ── GitHub OAuth login (SUPERADMIN uniquement) ─────────────────────

  async loginWithGithub(profile: {
    githubId: string;
    email: string;
    name: string;
  }) {
    // 1. Chercher par githubId
    let user = await this.usersService.findByGithubId(profile.githubId);

    // Correction : si le githubId est lié à un compte non-SUPERADMIN
    // (erreur d'une tentative précédente), on délie et on recommence
    if (user && user.role !== 'SUPERADMIN') {
      await this.usersService.update(user._id.toString(), { githubId: null });
      user = null;
    }

    if (!user) {
      // 2. Lier au SUPERADMIN du système (unique admin)
      user = await this.usersService.findSuperAdmin();

      if (!user) {
        throw new ForbiddenException(
          'Aucun compte Super Administrateur trouvé dans le système.',
        );
      }

      await this.usersService.update(user._id.toString(), {
        githubId: profile.githubId,
      });

      // Recharger après update pour avoir le doc à jour
      user = await this.usersService.findSuperAdmin();
      if (!user) throw new ForbiddenException('Super Administrateur introuvable après mise à jour.');
    }

    await this.usersService.updateOnlineStatus(user._id.toString(), true);

    const accessToken = this.buildAccessToken(user);
    const refreshBundle = this.buildRefreshToken(user);
    await this.usersService.setRefreshToken(
      user._id.toString(),
      refreshBundle.token,
      refreshBundle.expiresAt,
    );

    const ghUserName = (user as any).name || (user as any).email;
    this.auditLogsService.log({
      action: AuditAction.GITHUB_LOGIN,
      userId: user._id.toString(),
      userName: ghUserName,
      userRole: (user as any).role,
      targetName: (user as any).matricule || (user as any).email,
      details: {
        email: (user as any).email,
        matricule: (user as any).matricule || null,
        githubId: profile.githubId,
        loginTime: new Date().toISOString(),
      },
    }).catch(() => {});

    return {
      accessToken,
      refreshToken: refreshBundle.token,
      refreshTokenExpiresAt: refreshBundle.expiresAt,
      user: this.buildUserPayload(user),
    };
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (payload?.type && payload.type !== 'refresh') {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    let user: any;
    try {
      user = await this.usersService.findByIdWithRefreshToken(payload.sub);
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }
    const refreshTokenHash = (user as any).refreshTokenHash;
    const refreshTokenExpiresAt = (user as any).refreshTokenExpiresAt as Date | undefined;

    if (!refreshTokenHash) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (refreshTokenExpiresAt && refreshTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expiré');
    }

    const matches = await bcrypt.compare(refreshToken, refreshTokenHash);
    if (!matches) throw new UnauthorizedException('Refresh token invalide');

    const accessToken = this.buildAccessToken(user);
    const refreshBundle = this.buildRefreshToken(user);
    await this.usersService.setRefreshToken(
      (user as any)._id.toString(),
      refreshBundle.token,
      refreshBundle.expiresAt,
    );

    return {
      accessToken,
      refreshToken: refreshBundle.token,
      refreshTokenExpiresAt: refreshBundle.expiresAt,
      user: this.buildUserPayload(user),
    };
  }

  async logout(userId: string) {
    await this.usersService.updateOnlineStatus(userId, false);
    await this.usersService.clearRefreshToken(userId);
    return { message: 'Déconnexion réussie.' };
  }

  // ── Face login (no password required — identity already verified) ────

  async loginAsUser(user: any) {
    const id = user._id.toString();
    await this.usersService.updateOnlineStatus(id, true);

    const accessToken = this.buildAccessToken(user);
    const refreshBundle = this.buildRefreshToken(user);
    await this.usersService.setRefreshToken(id, refreshBundle.token, refreshBundle.expiresAt);

    return {
      accessToken,
      refreshToken: refreshBundle.token,
      refreshTokenExpiresAt: refreshBundle.expiresAt,
      user: this.buildUserPayload(user),
    };
  }

  // ── Changer le mot de passe (première connexion) ───────────────────

  async changePassword(userId: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 10);
    const user = await this.usersService.findById(userId) as any;
    await this.usersService.update(userId, {
      password: hashed,
      mustChangePassword: false,
      passwordExpiresAt: null,
    });
    await this.usersService.clearRefreshToken(userId);

    const userName = user?.name || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || userId;
    this.auditLogsService.log({
      action: AuditAction.PASSWORD_CHANGED,
      userId,
      userName,
      userRole: user?.role,
    }).catch(() => {});

    return { message: 'Mot de passe mis à jour avec succès.' };
  }
}
