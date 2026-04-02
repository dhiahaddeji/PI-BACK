import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ParticipationsService } from './participations.service';

@Controller('participations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParticipationsController {
  constructor(private readonly service: ParticipationsService) {}

  @Roles('EMPLOYEE')
  @Get('me')
  me(@Request() req: any) {
    return this.service.listForEmployee(req.user.userId);
  }
}
