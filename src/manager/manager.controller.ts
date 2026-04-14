import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('manager')
export class ManagerController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @Get('dashboard')
  getDashboard(@Req() req) {
    return { message: 'Accès autorisé Manager', user: req.user };
  }
}
