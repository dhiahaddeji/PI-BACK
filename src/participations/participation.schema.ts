import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ParticipationDocument = HydratedDocument<Participation>;

@Schema({ timestamps: true })
export class Participation {
  @Prop({ required: true, index: true }) activityId: string;
  @Prop({ required: true, index: true }) employeeId: string;

  @Prop({ required: true })
  status: 'ACCEPTED' | 'DECLINED';

  @Prop({ default: '' }) justification: string;
}

export const ParticipationSchema = SchemaFactory.createForClass(Participation);
