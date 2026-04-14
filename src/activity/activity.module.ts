import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Activity, ActivitySchema } from './activity.schema';
import { ActivitiesService } from './activity.service';
import { ActivitiesController } from './activity.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Recommendation, RecommendationSchema } from '../recommendations/recommendation.schema';
import { Invitation, InvitationSchema } from '../invitations/invitation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: Recommendation.name, schema: RecommendationSchema },
      { name: Invitation.name, schema: InvitationSchema },
    ]),
    AuditLogsModule,
    NotificationsModule,
  ],
  providers: [ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService],
})
export class ActivityModule {}
