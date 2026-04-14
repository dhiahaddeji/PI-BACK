import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

export enum AuditAction {
  USER_LOGIN             = 'USER_LOGIN',
  GITHUB_LOGIN           = 'GITHUB_LOGIN',
  USER_CREATED           = 'USER_CREATED',
  USER_UPDATED           = 'USER_UPDATED',
  USER_DELETED           = 'USER_DELETED',
  PASSWORD_CHANGED       = 'PASSWORD_CHANGED',
  SKILL_SUBMITTED        = 'SKILL_SUBMITTED',
  SKILL_APPROVED         = 'SKILL_APPROVED',
  SKILL_REJECTED         = 'SKILL_REJECTED',
  ACTIVITY_CREATED       = 'ACTIVITY_CREATED',
  ACTIVITY_STATUS_CHANGED = 'ACTIVITY_STATUS_CHANGED',
}

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true, enum: AuditAction })
  action: AuditAction;

  @Prop()
  userId: string;

  @Prop()
  userName: string;

  @Prop()
  userRole: string;

  @Prop()
  targetId: string;

  @Prop()
  targetName: string;

  @Prop({ type: Object, default: {} })
  details: Record<string, any>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
