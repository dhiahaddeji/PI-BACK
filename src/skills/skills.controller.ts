import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SkillsService } from './skills.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';

@Controller('skills')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SkillsController {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ── Employee: get my skills ──────────────────────────────────────────
  @Roles('EMPLOYEE')
  @Get('mine')
  async getMySkills(@Request() req: any) {
    return this.skillsService.getMySkills(req.user.userId);
  }

  // ── Employee: submit skill update request ────────────────────────────
  @Roles('EMPLOYEE')
  @Post('request')
  async submitRequest(
    @Request() req: any,
    @Body() body: { savoir: any[]; savoir_faire: any[]; savoir_etre: any[] },
  ) {
    const user = req.user;
    const name = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.name || user.email;
    const result = await this.skillsService.submitRequest(
      user.userId,
      name,
      body.savoir || [],
      body.savoir_faire || [],
      body.savoir_etre || [],
    );
    this.auditLogsService.log({
      action: AuditAction.SKILL_SUBMITTED,
      userId: user.userId,
      userName: name,
      userRole: user.role,
      targetId: (result as any)._id?.toString(),
      details: {
        savoirCount: (body.savoir || []).length,
        savoirFaireCount: (body.savoir_faire || []).length,
        savoirEtreCount: (body.savoir_etre || []).length,
      },
    }).catch(() => {});
    return result;
  }

  // ── Manager / HR: get all pending requests ───────────────────────────
  @Roles('MANAGER', 'HR', 'SUPERADMIN')
  @Get('pending')
  async getPending() {
    return this.skillsService.getPending();
  }

  // ── Manager / HR: get all requests ──────────────────────────────────
  @Roles('MANAGER', 'HR', 'SUPERADMIN')
  @Get('all')
  async getAll() {
    return this.skillsService.getAll();
  }

  // ── HR: get one employee's skills ────────────────────────────────────
  @Roles('HR', 'SUPERADMIN', 'MANAGER')
  @Get('employee/:id')
  async getEmployeeSkills(@Param('id') id: string) {
    return this.skillsService.getEmployeeSkills(id);
  }

  // ── Manager: approve ─────────────────────────────────────────────────
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch(':id/approve')
  async approve(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { note?: string },
  ) {
    const result = await this.skillsService.approve(id, req.user.userId, body.note);
    this.auditLogsService.log({
      action: AuditAction.SKILL_APPROVED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.employeeName,
      details: { note: body.note, employeeId: (result as any)?.employeeId },
    }).catch(() => {});
    return result;
  }

  // ── Manager: reject ──────────────────────────────────────────────────
  @Roles('MANAGER', 'SUPERADMIN')
  @Patch(':id/reject')
  async reject(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { note?: string },
  ) {
    const result = await this.skillsService.reject(id, req.user.userId, body.note);
    this.auditLogsService.log({
      action: AuditAction.SKILL_REJECTED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.employeeName,
      details: { note: body.note, employeeId: (result as any)?.employeeId },
    }).catch(() => {});
    return result;
  }

  // ── HR Analytics: skills coverage by department ─────────────────────
  @Roles('HR', 'SUPERADMIN', 'MANAGER')
  @Get('analytics')
  async getAnalytics() {
    return this.skillsService.getSkillsAnalytics();
  }

  // ── AI: all employees with skills ────────────────────────────────────
  @Roles('HR', 'SUPERADMIN')
  @Get('employees-skills')
  async getAllEmployeeSkills() {
    return this.skillsService.getAllEmployeeSkills();
  }

  // ── Post-activity evaluation: update skill levels after participation ─
  @Roles('HR', 'MANAGER', 'SUPERADMIN')
  @Post('evaluate')
  async postActivityEvaluation(
    @Body() body: { employeeId: string; skillUpdates: { skillName: string; newLevel: string }[] },
  ) {
    return this.skillsService.postActivityEvaluation(
      body.employeeId,
      body.skillUpdates || [],
    );
  }
}
