import { SetMetadata } from '@nestjs/common';

// On définit une clé pour les rôles
export const ROLES_KEY = 'roles';

// Le décorateur @Roles('HR') ou @Roles('MANAGER')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
