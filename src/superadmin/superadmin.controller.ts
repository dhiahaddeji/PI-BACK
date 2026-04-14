import {
  Controller,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Get,
  Request,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Readable } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const csvParser = require('csv-parser') as typeof import('csv-parser');
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';

// ── Helpers ───────────────────────────────────────────────────────────────────

function generatePassword(length = 12): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&*-_';
  let pw = '';
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

const VALID_ROLES = ['EMPLOYEE', 'HR', 'MANAGER'];

/** Parse a CSV buffer into an array of plain row objects. */
function parseCsvBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    Readable.from(buffer)
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('admin')
export class SuperAdminController {
  constructor(
    private usersService: UsersService,
    private mailService: MailService,
    private auditLogsService: AuditLogsService,
  ) {}

  // ── Shared user-creation logic (reused by both endpoints) ──────────────────

  private async createSingleUser(
    data: { name: string; email: string; role: string; date_embauche?: string },
    actorId: string,
    actorName: string,
    actorRole: string,
  ) {
    const matricule = await this.usersService.nextMatricule(data.role);
    const tempPassword = generatePassword();
    const passwordExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.usersService.create({
      name: data.name,
      email: data.email,
      role: data.role,
      matricule,
      date_embauche: data.date_embauche || undefined,
      password: tempPassword,
      mustChangePassword: true,
      passwordExpiresAt,
      isProfileComplete: false,
      status: 'ACTIVE',
      en_ligne: false,
    });

    await this.mailService.sendWelcomeWithCredentials({
      to: data.email,
      name: data.name,
      role: data.role,
      password: tempPassword,
    });

    this.auditLogsService
      .log({
        action: AuditAction.USER_CREATED,
        userId: actorId,
        userName: actorName,
        userRole: actorRole,
        targetId: user._id.toString(),
        targetName: data.name || data.email,
        details: { email: data.email, role: data.role, matricule },
      })
      .catch(() => {});

    return { userId: user._id, email: user.email, matricule };
  }

  // ── Endpoints ─────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'HR', 'MANAGER')
  @Get('users')
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (!page && !limit) return this.usersService.findAll();
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 20;
    return this.usersService.listPaginated({}, p, l);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'HR', 'MANAGER')
  @Get('user/:id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Post('create-user')
  async createUser(@Body() body: any, @Request() req: any) {
    const result = await this.createSingleUser(
      {
        name: body.name,
        email: body.email,
        role: body.role,
        date_embauche: body.date_embauche,
      },
      req.user.userId,
      req.user.name,
      req.user.role,
    );

    return {
      message: 'Compte créé et email envoyé.',
      userId: result.userId,
      email: result.email,
    };
  }

  /**
   * POST /admin/upload-csv
   * Accepts a .csv file and bulk-creates users using the same logic as create-user.
   * CSV format: name,email,role,date_embauche (date_embauche is optional)
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Post('upload-csv')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        const isCSV =
          file.mimetype === 'text/csv' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.originalname.toLowerCase().endsWith('.csv');
        if (!isCSV) {
          return cb(
            new BadRequestException('Only .csv files are accepted'),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
    }),
  )
  async uploadCsv(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    let rows: Record<string, string>[];
    try {
      rows = await parseCsvBuffer(file.buffer);
    } catch {
      throw new BadRequestException('Failed to parse CSV file');
    }

    if (rows.length === 0) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const name = row['name']?.trim();
      const email = row['email']?.trim();
      const role = row['role']?.trim().toUpperCase();
      const date_embauche = row['date_embauche']?.trim() || undefined;

      // ── Row validation ──────────────────────────────────────────────
      if (!name || !email || !role) {
        failed++;
        errors.push(
          `Row skipped (missing fields): ${JSON.stringify({ name, email, role })}`,
        );
        continue;
      }

      if (!VALID_ROLES.includes(role)) {
        failed++;
        errors.push(`Invalid role "${role}" for ${email}`);
        continue;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        failed++;
        errors.push(`Invalid email format: ${email}`);
        continue;
      }

      // ── Check for duplicate email ───────────────────────────────────
      const existing = await this.usersService.findByEmail(email);
      if (existing) {
        failed++;
        errors.push(`Email already exists: ${email}`);
        continue;
      }

      // ── Create user ─────────────────────────────────────────────────
      try {
        await this.createSingleUser(
          { name, email, role, date_embauche },
          req.user.userId,
          req.user.name,
          req.user.role,
        );
        success++;
      } catch (err) {
        failed++;
        const msg =
          (err as any)?.message || `Unknown error for ${email}`;
        errors.push(`Failed to create ${email}: ${msg}`);
      }
    }

    return { success, failed, errors };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Patch('update-user/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const result = await this.usersService.update(id, body);
    this.auditLogsService
      .log({
        action: AuditAction.USER_UPDATED,
        userId: req.user.userId,
        userName: req.user.name,
        userRole: req.user.role,
        targetId: id,
        targetName: (result as any)?.name || (result as any)?.email || id,
        details: { updatedFields: Object.keys(body) },
      })
      .catch(() => {});
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Delete('delete-user/:id')
  async deleteUser(@Param('id') id: string, @Request() req: any) {
    const target = (await this.usersService.findById(id)) as any;
    const result = await this.usersService.delete(id);
    this.auditLogsService
      .log({
        action: AuditAction.USER_DELETED,
        userId: req.user.userId,
        userName: req.user.name,
        userRole: req.user.role,
        targetId: id,
        targetName: target?.name || target?.email || id,
        details: { email: target?.email, role: target?.role },
      })
      .catch(() => {});
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Get('check-matricule/:matricule')
  async checkMatricule(@Param('matricule') matricule: string) {
    const exists = await this.usersService.findByMatricule(matricule);
    return { exists: !!exists };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Get('next-matricule/:role')
  async nextMatricule(@Param('role') role: string) {
    const matricule = await this.usersService.nextMatricule(role);
    return { matricule };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Patch('suspend-user/:id')
  async suspendUser(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    // Récupérer l'utilisateur existant
    const user = await this.usersService.findById(id);

    // Mettre à jour le statut à 'SUSPENDED'
    const suspendedUser = await this.usersService.update(id, {
      status: 'SUSPENDED',
    });

    // Envoyer l'email de notification
    await this.mailService.sendAccountSuspendedEmail({
      to: user.email,
      name: user.name,
      reason: body.reason,
    });

    return {
      message: 'Utilisateur suspendu et email envoyé.',
      userId: suspendedUser._id,
      email: suspendedUser.email,
      status: suspendedUser.status,
    };
  }
}
