import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    console.log('🛡️ RolesGuard - user:', user);
    console.log('🛡️ RolesGuard - required:', requiredRoles);

    const userRole = (user?.role || '').toUpperCase();
    const allowed = requiredRoles.map((r) => r.toUpperCase());

    return allowed.includes(userRole);
  }
}
