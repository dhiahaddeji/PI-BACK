import { Module } from '@nestjs/common';
import { SuperAdminController } from './superadmin.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [UsersModule, MailModule, AuditLogsModule],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}
