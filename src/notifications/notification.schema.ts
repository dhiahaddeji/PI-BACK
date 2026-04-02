import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

export type NotifType =
  | 'skill_submitted'      // employee submitted fiche → manager
  | 'skill_validated'      // manager validated fiche → employee
  | 'skill_rejected'       // manager rejected fiche → employee
  | 'cv_import'            // employee imported skills from CV → manager
  | 'new_message'          // new message received
  | 'activity_invitation'  // employee invited to activity
  | 'activity_response';   // employee responded to invitation → manager

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true })
  userId: string; // recipient

  @Prop({ required: true })
  type: NotifType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: '' })
  link: string; // frontend route to navigate on click

  @Prop({ default: false })
  read: boolean;

  @Prop({ type: Object, default: {} })
  meta: {
    ficheId?:       string;
    employeeId?:    string;
    employeeName?:  string;
    managerId?:     string;
  };
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
