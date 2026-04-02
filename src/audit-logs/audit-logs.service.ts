import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditLogDocument, AuditAction } from './audit-log.schema';
import { NotificationsGateway } from '../notifications/notifications.gateway';

export interface CreateAuditLogDto {
  action: AuditAction;
  userId?: string;
  userName?: string;
  userRole?: string;
  targetId?: string;
  targetName?: string;
  details?: Record<string, any>;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLogDocument>,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    const entry = await this.auditLogModel.create(dto);

    // Convert to plain object for WebSocket serialization (Mongoose docs aren't plain objects)
    const plain = (entry as any).toObject ? (entry as any).toObject() : entry;
    this.notificationsGateway.emitToRole('SUPERADMIN', 'audit_log', plain);

    return entry;
  }

  async findAll(filters: {
    action?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    page?: number;
  }) {
    const query: Record<string, any> = {};

    if (filters.action) query.action = filters.action;
    if (filters.userId) query.userId = filters.userId;

    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const limit = Math.min(filters.limit ?? 50, 200);
    const page  = Math.max(filters.page ?? 1, 1);
    const skip  = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.auditLogModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.auditLogModel.countDocuments(query),
    ]);

    return { logs, total, page, limit };
  }

  async exportCsv(filters: {
    action?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<string> {
    const query: Record<string, any> = {};
    if (filters.action) query.action = filters.action;
    if (filters.dateFrom || filters.dateTo) {
      query.createdAt = {};
      if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        query.createdAt.$lte = to;
      }
    }

    const logs = await this.auditLogModel.find(query).sort({ createdAt: -1 }).limit(5000);

    const escape = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const header = ['Date', 'Action', 'Utilisateur', 'Rôle', 'Cible', 'Détails'].map(escape).join(',');
    const rows = logs.map((log: any) => [
      escape(new Date(log.createdAt).toLocaleString('fr-FR')),
      escape(log.action),
      escape(log.userName || log.userId || ''),
      escape(log.userRole || ''),
      escape(log.targetName || log.targetId || ''),
      escape(log.details ? JSON.stringify(log.details) : ''),
    ].join(','));

    return [header, ...rows].join('\n');
  }
}
