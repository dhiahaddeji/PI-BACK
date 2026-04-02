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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/audit-log.schema';

function generatePassword(length = 12): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$&*-_';
  let pw = '';
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

@Controller('admin')
export class SuperAdminController {
  constructor(
    private usersService: UsersService,
    private mailService: MailService,
    private auditLogsService: AuditLogsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN', 'HR', 'MANAGER')
  @Get('users')
  async getAllUsers() {
    return this.usersService.findAll();
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
    const tempPassword = generatePassword();
    const passwordExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.usersService.create({
      ...body,
      password: tempPassword,
      mustChangePassword: true,
      passwordExpiresAt,
      isProfileComplete: false,
      status: 'ACTIVE',
      en_ligne: false,
    });

    await this.mailService.sendWelcomeWithCredentials({
      to: body.email,
      name: body.name,
      role: body.role,
      password: tempPassword,
    });

    this.auditLogsService.log({
      action: AuditAction.USER_CREATED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: user._id.toString(),
      targetName: body.name || body.email,
      details: { email: body.email, role: body.role, matricule: body.matricule },
    }).catch(() => {});

    return {
      message: 'Compte créé et email envoyé.',
      userId: user._id,
      email: user.email,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Patch('update-user/:id')
  async updateUser(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    const result = await this.usersService.update(id, body);
    this.auditLogsService.log({
      action: AuditAction.USER_UPDATED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: (result as any)?.name || (result as any)?.email || id,
      details: { updatedFields: Object.keys(body) },
    }).catch(() => {});
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPERADMIN')
  @Delete('delete-user/:id')
  async deleteUser(@Param('id') id: string, @Request() req: any) {
    const target = await this.usersService.findById(id) as any;
    const result = await this.usersService.delete(id);
    this.auditLogsService.log({
      action: AuditAction.USER_DELETED,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      targetId: id,
      targetName: target?.name || target?.email || id,
      details: { email: target?.email, role: target?.role },
    }).catch(() => {});
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
}
