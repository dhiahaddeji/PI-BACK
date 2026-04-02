import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

/**
 * type = 'dm'           → 2 participants, bidirectional
 * type = 'group'        → N participants, everyone can write
 * type = 'announcement' → N participants, only allowedSenders can write (HR/Manager broadcast)
 */
@Schema({ timestamps: true, collection: 'conversations' })
export class Conversation {
  @Prop({ required: true, enum: ['dm', 'group', 'announcement'] })
  type: string;

  /** Display name — required for group & announcement, auto-generated for dm */
  @Prop({ default: '' })
  name: string;

  /** All user IDs who can see this conversation */
  @Prop({ type: [String], default: [] })
  participants: string[];

  /**
   * For announcements: only these user IDs may send messages.
   * For dm/group: empty (anyone in participants can send).
   */
  @Prop({ type: [String], default: [] })
  allowedSenders: string[];

  @Prop({ required: true })
  createdBy: string;

  @Prop({ default: null })
  lastMessageAt: Date;

  @Prop({ default: '' })
  lastMessagePreview: string;

  /**
   * Per-user unread count: { "userId": 3 }
   * Stored as Mixed/Object so we can do $inc operations.
   */
  @Prop({ type: Object, default: {} })
  unreadCounts: Record<string, number>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
