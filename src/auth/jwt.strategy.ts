import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'SECRET_KEY',
    });
  }

  async validate(payload: any) {
    // Always fetch fresh role from DB — handles missing/stale role in token
    let role = payload.role;
    let name = payload.name || payload.email;

    if (!role && payload.sub) {
      try {
        const user = await this.usersService.findById(payload.sub);
        if (user) {
          role = (user as any).role;
          name = (user as any).name || name;
        }
      } catch { /* keep token values as fallback */ }
    }

    return {
      userId: payload.sub,
      name,
      email: payload.email,
      role,
    };
  }
}
