import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SkillRequestDocument = HydratedDocument<SkillRequest>;
export type SkillRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// Skill item shape (same as in user schema)
export interface SkillItem {
  name: string;
  level: string; // LOW | MEDIUM | HIGH | EXPERT
  score: number;
}

@Schema({ timestamps: true })
export class SkillRequest {
  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ type: [Object], default: [] })
  savoir: SkillItem[];

  @Prop({ type: [Object], default: [] })
  savoir_faire: SkillItem[];

  @Prop({ type: [Object], default: [] })
  savoir_etre: SkillItem[];

  @Prop({ default: 'PENDING' })
  status: SkillRequestStatus;

  @Prop()
  reviewedBy: string;

  @Prop()
  reviewNote: string;

  @Prop()
  reviewedAt: Date;
}

export const SkillRequestSchema = SchemaFactory.createForClass(SkillRequest);
