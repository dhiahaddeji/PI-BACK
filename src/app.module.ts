import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

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
import { FaceModule } from './face/face.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60, limit: 120 }],
    }),
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
    FaceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
