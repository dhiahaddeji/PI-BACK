import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HrModule } from './hr/hr.module';
import { ManagerModule } from './manager/manager.module';
import { EmployeeModule } from './employee/employee.module';
import { SuperAdminModule } from './superadmin/superadmin.module';
import { ActivityModule } from './activity/activity.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ParticipationsModule } from './participations/participations.module';
import { SkillsModule } from './skills/skills.module';
import { AiModule } from './ai/ai.module';
import { CompetencesModule } from './competences/competences.module';
import { DepartmentsModule } from './departments/departments.module';
import { MessagingModule } from './messaging/messaging.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRoot(process.env.MONGODB_URI!),
    MailModule,
    AuthModule,
    UsersModule,
    HrModule,
    ManagerModule,
    EmployeeModule,
    SuperAdminModule,
    ActivityModule,
    RecommendationsModule,
    InvitationsModule,
    ParticipationsModule,
    SkillsModule,
    AiModule,
    CompetencesModule,
    DepartmentsModule,
    MessagingModule,
    NotificationsModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
