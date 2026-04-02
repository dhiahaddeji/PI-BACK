import { Injectable, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    console.log('🛡️ JwtAuthGuard - Checking authorization...');
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    console.log(
      '🛡️ JwtAuthGuard - Auth header:',
      authHeader ? '✅ Present' : '❌ Missing',
    );

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    console.log('🛡️ JwtAuthGuard.handleRequest - err:', err);
    console.log('🛡️ JwtAuthGuard.handleRequest - user:', user);

    if (err || !user) {
      console.error('❌ JwtAuthGuard - Authentication failed');
      throw err || new ForbiddenException('No user found');
    }
    return user;
  }
}
