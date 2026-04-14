import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { ActivityModule } from '../activity/activity.module';
import { CompetencesModule } from '../competences/competences.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { Recommendation, RecommendationSchema } from './recommendation.schema';
import { Activity, ActivitySchema } from '../activity/activity.schema';

import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recommendation.name, schema: RecommendationSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),

    UsersModule,
    ActivityModule,
    CompetencesModule,
    InvitationsModule,
    NotificationsModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
})
export class RecommendationsModule {}