import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Participation, ParticipationSchema } from './participation.schema';
import { Activity, ActivitySchema } from '../activity/activity.schema';
import { ParticipationsService } from './participations.service';
import { ParticipationsController } from './participations.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Participation.name, schema: ParticipationSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),
  ],
  providers: [ParticipationsService],
  controllers: [ParticipationsController],
  exports: [ParticipationsService],
})
export class ParticipationsModule {}
