import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { InvitationsService } from './invitations.service';
import { ActivitiesService } from '../activity/activity.service';
import { ParticipationsService } from '../participations/participations.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('invitations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvitationsController {
  constructor(
    private readonly invService: InvitationsService,
    private readonly activitiesService: ActivitiesService,
    private readonly participationsService: ParticipationsService,
    private readonly notifSvc: NotificationsService,
  ) {}

  // Manager notifies participants => create invitations
  @Roles('MANAGER')
  @Post(':activityId/notify')
  async notify(
    @Param('activityId') activityId: string,
    @Body() body: { employeeIds: string[] },
  ) {
    const activity = await this.activitiesService.findById(activityId);
    if (!activity) throw new Error('Activity not found');

    await this.invService.bulkCreate(activityId, body.employeeIds || []);
    await this.activitiesService.update(activityId, { status: 'NOTIFIED' });

    // Notify each invited employee in real-time
    const title = (activity as any).title || 'une activité';
    Promise.all(
      (body.employeeIds || []).map(eid =>
        this.notifSvc.notifyActivityInvitation(eid, title, activityId),
      ),
    ).catch(() => {});

    return { ok: true };
  }

  // Employee: list my invitations
  @Roles('EMPLOYEE')
  @Get('me')
  me(@Request() req: any) {
    return this.invService.listForEmployee(req.user.userId);
  }

  // Fetch a single invitation (employees only their own)
  @Roles('EMPLOYEE', 'HR', 'MANAGER')
  @Get(':id')
  async getById(@Param('id') id: string, @Request() req: any) {
    const inv = await this.invService.findById(id);
    if (
      req.user.role === 'EMPLOYEE' &&
      inv &&
      inv.employeeId !== req.user.userId
    ) {
      throw new Error('Forbidden');
    }
    return inv;
  }

  @Roles('EMPLOYEE')
  @Patch(':id/respond')
  async respond(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { decision: 'ACCEPTED' | 'DECLINED'; justification?: string },
  ) {
    const inv = await this.invService.findById(id);
    if (!inv) throw new Error('Invitation not found');
    if (inv.employeeId !== req.user.userId) throw new Error('Forbidden');

    const updated = await this.invService.respond(
      id,
      body.decision,
      body.justification,
    );
    if (!updated) throw new Error('Failed to update invitation');

    if (updated.status !== 'ACCEPTED' && updated.status !== 'DECLINED')
      throw new Error('Invalid invitation status');

    // create/update participation
    await this.participationsService.upsert({
      activityId: inv.activityId,
      employeeId: inv.employeeId,
      status: updated.status,
      justification: updated.justification,
    });

    // Notify managers of the response
    const activity = await this.activitiesService.findById(inv.activityId);
    if (activity) {
      this.notifSvc.notifyManagerActivityResponse(
        req.user.userId,
        req.user.name || 'Un employé',
        (activity as any).title || 'une activité',
        inv.activityId,
        updated.status as 'ACCEPTED' | 'DECLINED',
      ).catch(() => {});
    }

    return updated;
  }

  // HR/Manager can inspect invitations by activity
  @Roles('HR', 'MANAGER')
  @Get('activity/:activityId')
  byActivity(@Param('activityId') activityId: string) {
    return this.invService.listByActivity(activityId);
  }
}
