import { Controller, Get, Patch, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('EMPLOYEE', 'MANAGER', 'HR', 'SUPERADMIN')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // GET /notifications — my notifications + unread count
  @Get()
  getMyNotifications(@Request() req: any) {
    return this.svc.getMyNotifications(req.user.userId);
  }

  // GET /notifications/count — unread count only (for badge polling)
  @Get('count')
  countUnread(@Request() req: any) {
    return this.svc.countUnread(req.user.userId);
  }

  // PATCH /notifications/:id/read — mark one as read
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.svc.markRead(id, req.user.userId);
  }

  // PATCH /notifications/read-all — mark all as read
  @Patch('read-all')
  markAllRead(@Request() req: any) {
    return this.svc.markAllRead(req.user.userId);
  }
}
