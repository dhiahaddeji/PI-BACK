import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invitation, InvitationSchema } from './invitation.schema';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { ActivityModule } from '../activity/activity.module';
import { ParticipationsModule } from '../participations/participations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invitation.name, schema: InvitationSchema },
    ]),
    ActivityModule,
    ParticipationsModule,
    NotificationsModule,
  ],
  providers: [InvitationsService],
  controllers: [InvitationsController],
  exports: [InvitationsService],
})
export class InvitationsModule {}
