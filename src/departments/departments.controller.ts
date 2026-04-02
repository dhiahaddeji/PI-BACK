import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DepartmentsService } from './departments.service';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Roles('HR', 'MANAGER', 'SUPERADMIN')
  @Get()
  findAll() { return this.svc.findAll(); }

  // ── Departments enriched with employees + manager (HR dashboard) ──────
  @Roles('HR', 'SUPERADMIN')
  @Get('with-members')
  getWithMembers() { return this.svc.getWithMembers(); }

  @Roles('HR', 'MANAGER', 'SUPERADMIN')
  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findById(id); }

  @Roles('HR', 'SUPERADMIN')
  @Post()
  create(@Body() body: any) { return this.svc.create(body); }

  // ── General update (name, code, description, manager_id) ─────────────
  @Roles('HR', 'SUPERADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  // ── Explicit manager assignment shorthand ─────────────────────────────
  @Roles('HR', 'SUPERADMIN')
  @Patch(':id/assign-manager')
  assignManager(@Param('id') id: string, @Body() body: { manager_id: string | null }) {
    return this.svc.update(id, { manager_id: body.manager_id ?? undefined });
  }

  @Roles('SUPERADMIN')
  @Delete(':id')
  delete(@Param('id') id: string) { return this.svc.delete(id); }
}
