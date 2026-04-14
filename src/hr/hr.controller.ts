import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('hr')
export class HrController {
  // Route protégée pour tester JWT + rôle
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('HR')
  @Get('profile')
  getProfile(@Req() req) {
    return { message: 'Accès autorisé HR', user: req.user };
  }
}
