import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './conversation.schema';
import { Message, MessageSchema } from './message.schema';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name,      schema: MessageSchema },
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [MessagingController],
  providers:   [MessagingService],
  exports:     [MessagingService],
})
export class MessagingModule {}
