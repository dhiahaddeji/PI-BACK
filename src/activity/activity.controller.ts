import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel as MongooseInject } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ActivitiesService } from './activity.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConfirmActivityDto } from './dto/confirm-activity.dto';
import { SetActivityStatusDto } from './dto/set-status.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Recommendation } from '../recommendations/recommendation.schema';
import { Invitation } from '../invitations/invitation.schema';

@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(
    private readonly service: ActivitiesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notifService: NotificationsService,
    @MongooseInject(Recommendation.name) private readonly recModel: Model<Recommendation>,
    @MongooseInject(Invitation.name)     private readonly invModel: Model<Invitation>,
  ) {}

  @Roles('HR')
  @Post()
  async create(@Body() body: CreateActivityDto, @Request() req: any) {
    const startDate = body.startDate || body.date;
    const endDate = body.endDate || startDate || body.date;
    const normalizedStartDate = startDate ? new Date(startDate) : undefined;
    const normalizedEndDate = endDate ? new Date(endDate) : undefined;
    const result = await this.service.create({
      ...body,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      date: body.date || startDate,
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
  list(
    @Query() query?: PaginationQueryDto,
  ) {
    const page = query?.page;
    const limit = query?.limit;
    if (!page && !limit) return this.service.findAll();

    return this.service.listPaginated(page, limit);
  }

  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Roles('MANAGER')
  @Patch(':id/confirm')
  async confirm(
    @Param('id') id: string,
    @Body() body: ConfirmActivityDto,
    @Request() req: any,
  ) {
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
    const activity = await this.service.findById(id);
    const result   = await this.service.update(id, { status: 'NOTIFIED' });

    // Create invitations for confirmed participants + notify each employee
    const participants: string[] = (activity as any)?.participants || [];
    if (participants.length > 0) {
      // Upsert invitations (delete old PENDING, create fresh ones)
      await this.invModel.deleteMany({ activityId: id, status: 'PENDING' });
      await this.invModel.insertMany(
        participants.map(empId => ({ activityId: id, employeeId: empId, status: 'PENDING', justification: '' })),
        { ordered: false },
      );

      // Real-time + persisted notification for each employee
      const title = (activity as any)?.title || 'une activité';
      await Promise.all(
        participants.map(empId =>
          this.notifService.notifyActivityInvitation(empId, title, id).catch(() => {}),
        ),
      );
    }

    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: 'NOTIFIED', notifiedCount: participants.length },
    }).catch(() => {});
    return result;
  }

  // ── MANAGER: refuse entire activity with a written reason ─────────────
  @Roles('MANAGER')
  @Patch(':id/refuse')
  async refuse(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ) {
    if (!body.reason?.trim()) {
      throw new BadRequestException('Un motif de refus est obligatoire.');
    }

    const activity = await this.service.findById(id);
    if (!activity) throw new NotFoundException('Activité introuvable');

    const result = await this.service.update(id, {
      status: 'MANAGER_REFUSED' as any,
      refusalReason: body.reason.trim(),
    } as any);

    // Notify the HR who created this activity
    if ((activity as any).createdBy) {
      await this.notifService.notifyHRActivityRefused(
        (activity as any).createdBy,
        (activity as any).title,
        id,
        body.reason.trim(),
        req.user.name || req.user.userId,
      );
    }

    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: 'MANAGER_REFUSED', reason: body.reason },
    }).catch(() => {});

    return result;
  }

  // ── MANAGER: refuse specific employees → HR must regenerate list ───────
  @Roles('MANAGER')
  @Patch(':id/refuse-employees')
  async refuseEmployees(
    @Param('id') id: string,
    @Body() body: { employeeIds: string[]; employeeNames?: string[] },
    @Request() req: any,
  ) {
    if (!body.employeeIds?.length) {
      throw new BadRequestException('Aucun employé sélectionné pour le refus.');
    }

    const activity = await this.service.findById(id);
    if (!activity) throw new NotFoundException('Activité introuvable');

    // Update the recommendation: add refused employees, remove them from the list
    const rec = await this.recModel.findOne({ activityId: id });
    if (rec) {
      const existing = (rec as any).refusedEmployees || [];
      const merged   = [...new Set([...existing, ...body.employeeIds])];
      const filtered = ((rec as any).list || []).filter(
        (e: any) => !body.employeeIds.includes(e.employeeId),
      );
      await this.recModel.findOneAndUpdate(
        { activityId: id },
        { refusedEmployees: merged, list: filtered },
        { new: true },
      );
    }

    // Set activity status back so HR knows to regenerate
    const result = await this.service.update(id, { status: 'HR_REGEN_NEEDED' as any } as any);

    // Notify the HR who created this activity
    if ((activity as any).createdBy) {
      await this.notifService.notifyHRListRefused(
        (activity as any).createdBy,
        (activity as any).title,
        id,
        body.employeeIds.length,
        body.employeeNames || [],
        req.user.name || req.user.userId,
      );
    }

    this.auditLogsService.log({
      action: AuditAction.ACTIVITY_STATUS_CHANGED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.title,
      details: { newStatus: 'HR_REGEN_NEEDED', refusedCount: body.employeeIds.length },
    }).catch(() => {});

    return result;
  }

  @Roles('HR')
  @Patch(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: SetActivityStatusDto,
    @Request() req: any,
  ) {
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
