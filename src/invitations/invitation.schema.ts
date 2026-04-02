import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InvitationDocument = HydratedDocument<Invitation>;

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ required: true, index: true }) activityId: string;
  @Prop({ required: true, index: true }) employeeId: string;

  @Prop({ default: 'PENDING' })
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';

  @Prop({ default: '' }) justification: string;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);
