import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  async findAll(
    @Query('action')   action?: string,
    @Query('userId')   userId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?: string,
    @Query('limit')    limit?: string,
    @Query('page')     page?: string,
  ) {
    return this.auditLogsService.findAll({
      action,
      userId,
      dateFrom,
      dateTo,
      limit: limit ? parseInt(limit, 10) : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
    });
  }

  @Get('export')
  async exportCsv(
    @Res() res: Response,
    @Query('action')   action?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?: string,
  ) {
    const csv = await this.auditLogsService.exportCsv({ action, dateFrom, dateTo });
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8 support
  }
}
