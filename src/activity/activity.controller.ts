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
import { ActivitiesService } from './activity.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';

@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(
    private readonly service: ActivitiesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Roles('HR')
  @Post()
  async create(@Body() body: any, @Request() req: any) {
    const result = await this.service.create({
      ...body,
      seats: Number(body.seats || 0),
      createdBy: req.user.userId,
      status: 'DRAFT',
      participants: [],
    });
    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_CREATED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: (result as any)._id?.toString(),
      targetName: body.title,
      details: { type: body.type, date: body.date, seats: body.seats },
    }).catch(() => {});
    return result;
  }

  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get()
  list() {
    return this.service.findAll();
  }

  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Roles('MANAGER')
  @Patch(':id/confirm')
  async confirm(@Param('id') id: string, @Body() body: { participants: string[] }, @Request() req: any) {
    const result = await this.service.update(id, {
      participants: body.participants || [],
      status: 'MANAGER_CONFIRMED',
    });
    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: 'MANAGER_CONFIRMED', participantsCount: (body.participants || []).length },
    }).catch(() => {});
    return result;
  }

  @Roles('MANAGER')
  @Patch(':id/notified')
  async notified(@Param('id') id: string, @Request() req: any) {
    const result = await this.service.update(id, { status: 'NOTIFIED' });
    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: 'NOTIFIED' },
    }).catch(() => {});
    return result;
  }

  @Roles('HR')
  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: any) {
    const result = await this.service.update(id, { status: body.status as any });
    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: body.status },
    }).catch(() => {});
    return result;
  }
}
