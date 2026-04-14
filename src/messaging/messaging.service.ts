import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation, ConversationDocument } from './conversation.schema';
import { Message, MessageDocument } from './message.schema';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagingService {
  constructor(
    @InjectModel(Conversation.name) private convModel: Model<ConversationDocument>,
    @InjectModel(Message.name)      private msgModel:  Model<MessageDocument>,
    private readonly usersService:  UsersService,
    private readonly notifSvc:      NotificationsService,
  ) {}

  // ── User directory: everyone a given user can contact ─────────────────
  async getContactableUsers(requesterId: string) {
    const all = await this.usersService.findAll();
    return (all as any[])
      .filter(u => String(u._id) !== requesterId)
      .map(u => ({
        _id:   String(u._id),
        name:  u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        email: u.email,
        role:  u.role,
      }));
  }

  // ── My conversations (enriched with unread count) ─────────────────────
  async getMyConversations(userId: string) {
    const convs = await this.convModel
      .find({ participants: userId })
      .sort({ lastMessageAt: -1 })
      .lean();

    return convs.map(c => ({
      ...c,
      unread: (c.unreadCounts as any)?.[userId] ?? 0,
    }));
  }

  // ── Create conversation ───────────────────────────────────────────────
  async createConversation(
    creatorId:   string,
    creatorRole: string,
    type:        string,
    name:        string,
    participantIds: string[],
  ) {
    if (!['dm', 'group', 'announcement'].includes(type)) {
      throw new BadRequestException('Type invalide');
    }

    // Ensure creator is always a participant
    const allIds = [...new Set([creatorId, ...participantIds])];

    if (type === 'dm') {
      if (allIds.length !== 2) throw new BadRequestException('Un DM nécessite exactement 2 participants');
      // Return existing DM if already exists
      const existing = await this.convModel.findOne({
        type: 'dm',
        participants: { $all: allIds, $size: 2 },
      });
      if (existing) return existing;
    }

    if (type === 'announcement') {
      if (!['HR', 'MANAGER', 'SUPERADMIN'].includes(creatorRole)) {
        throw new ForbiddenException('Seuls HR et Manager peuvent créer des annonces');
      }
    }

    // For announcements: only the creator can send (+ other managers/HR if added later)
    const allowedSenders: string[] = type === 'announcement' ? [creatorId] : [];

    const conv = await this.convModel.create({
      type,
      name: name || (type === 'dm' ? '' : 'Nouveau groupe'),
      participants:   allIds,
      allowedSenders,
      createdBy:      creatorId,
      lastMessageAt:  new Date(),
      lastMessagePreview: '',
      unreadCounts:   {},
    });

    return conv;
  }

  // ── Get messages for a conversation ──────────────────────────────────
  async getMessages(userId: string, conversationId: string, limit = 50, offset = 0) {
    const conv = await this.convModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    if (!conv.participants.includes(userId)) throw new ForbiddenException('Accès refusé');

    const total = await this.msgModel.countDocuments({ conversationId });
    const messages = await this.msgModel
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .skip(offset)
      .limit(limit);

    return { messages, total };
  }

  // ── Send a message ────────────────────────────────────────────────────
  async sendMessage(
    userId:   string,
    userName: string,
    userRole: string,
    conversationId: string,
    content:  string,
  ) {
    if (!content?.trim()) throw new BadRequestException('Message vide');

    const conv = await this.convModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    if (!conv.participants.includes(userId)) throw new ForbiddenException('Vous n\'êtes pas participant');

    // For announcements: only allowedSenders can write
    if (conv.type === 'announcement' && !conv.allowedSenders.includes(userId)) {
      throw new ForbiddenException('Cette conversation est en lecture seule pour vous');
    }

    const msg = await this.msgModel.create({
      conversationId,
      senderId:   userId,
      senderName: userName,
      senderRole: userRole,
      content:    content.trim(),
      readBy:     [userId],
    });

    // Update conversation metadata & increment unread for other participants
    const unreadIncrement: Record<string, any> = {};
    for (const pid of conv.participants) {
      if (pid !== userId) {
        unreadIncrement[`unreadCounts.${pid}`] = 1;
      }
    }

    await this.convModel.findByIdAndUpdate(conversationId, {
      $set: {
        lastMessageAt:      new Date(),
        lastMessagePreview: content.trim().slice(0, 80),
      },
      $inc: unreadIncrement,
    });

    // Real-time notification to other participants
    this.notifSvc.notifyNewMessage(
      userName,
      userId,
      conv.participants,
      conversationId,
      content.trim(),
    ).catch(() => {});

    return msg;
  }

  // ── Mark conversation as read ─────────────────────────────────────────
  async markRead(userId: string, conversationId: string) {
    const conv = await this.convModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    if (!conv.participants.includes(userId)) throw new ForbiddenException('Accès refusé');

    await this.convModel.findByIdAndUpdate(conversationId, {
      $set: { [`unreadCounts.${userId}`]: 0 },
    });

    return { ok: true };
  }

  // ── Add sender to announcement (HR can grant write access) ────────────
  async addAllowedSender(
    requesterId: string,
    requesterRole: string,
    conversationId: string,
    targetUserId: string,
  ) {
    if (!['HR', 'SUPERADMIN'].includes(requesterRole)) {
      throw new ForbiddenException('Seul HR peut modifier les droits d\'une annonce');
    }
    const conv = await this.convModel.findById(conversationId);
    if (!conv) throw new NotFoundException('Conversation introuvable');
    if (conv.type !== 'announcement') throw new BadRequestException('Non applicable');

    if (!conv.allowedSenders.includes(targetUserId)) {
      conv.allowedSenders.push(targetUserId);
      await conv.save();
    }
    return conv;
  }

  // ── Total unread across all conversations ─────────────────────────────
  async totalUnread(userId: string): Promise<number> {
    const convs = await this.convModel.find({ participants: userId }).lean();
    return convs.reduce((sum, c) => sum + ((c.unreadCounts as any)?.[userId] ?? 0), 0);
  }
}
