import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument, NotifType } from './notification.schema';
import { UsersService } from '../users/users.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notifModel: Model<NotificationDocument>,
    private readonly usersService: UsersService,
    private readonly gateway: NotificationsGateway,
  ) {}

  // ── Core: create + emit in real-time ─────────────────────────────────
  async create(payload: {
    userId:   string;
    type:     NotifType;
    title:    string;
    message:  string;
    link?:    string;
    meta?:    Record<string, string>;
  }) {
    const notif = await this.notifModel.create({
      userId:  payload.userId,
      type:    payload.type,
      title:   payload.title,
      message: payload.message,
      link:    payload.link  || '',
      meta:    payload.meta  || {},
      read:    false,
    });

    // Real-time push — never throw if gateway not ready
    try { this.gateway.emitNotification(payload.userId, notif.toObject()); } catch { /* ignore */ }

    return notif;
  }

  // ── Skill: employee submitted fiche → all managers ───────────────────
  async notifyManagersSkillSubmitted(employeeId: string, employeeName: string, ficheId: string) {
    const managers = await this.usersService.findByRole('MANAGER');
    await Promise.all(managers.map(m => this.create({
      userId:  m._id.toString(),
      type:    'skill_submitted',
      title:   'Fiche compétences à valider',
      message: `${employeeName} a soumis sa fiche de compétences.`,
      link:    '/manager/skill-approval',
      meta:    { ficheId, employeeId, employeeName },
    })));
  }

  // ── Skill: manager validated fiche → employee ─────────────────────────
  async notifyEmployeeValidated(employeeId: string, employeeName: string, ficheId: string, managerId: string) {
    await this.create({
      userId:  employeeId,
      type:    'skill_validated',
      title:   'Fiche compétences validée ✅',
      message: 'Votre fiche de compétences a été validée par votre manager.',
      link:    '/employee/skills',
      meta:    { ficheId, employeeId, employeeName, managerId },
    });
  }

  // ── Skill: manager rejected fiche → employee ─────────────────────────
  async notifyEmployeeRejected(employeeId: string, employeeName: string, ficheId: string, managerId: string, note: string) {
    await this.create({
      userId:  employeeId,
      type:    'skill_rejected',
      title:   'Fiche compétences à corriger ⚠️',
      message: `Votre fiche a été retournée${note ? ` : "${note}"` : ''}.`,
      link:    '/employee/skills',
      meta:    { ficheId, employeeId, employeeName, managerId },
    });
  }

  // ── Message: new message → all other participants ─────────────────────
  async notifyNewMessage(
    senderName: string,
    senderId: string,
    participantIds: string[],
    conversationId: string,
    preview: string,
  ) {
    const others = participantIds.filter(id => id !== senderId);
    await Promise.all(others.map(userId => this.create({
      userId,
      type:    'new_message',
      title:   `Nouveau message de ${senderName}`,
      message: preview.length > 80 ? preview.slice(0, 80) + '…' : preview,
      link:    '/messaging',
      meta:    { senderId, senderName, conversationId },
    })));
  }

  // ── Activity: invitation sent → employee ──────────────────────────────
  async notifyActivityInvitation(employeeId: string, activityTitle: string, activityId: string) {
    await this.create({
      userId:  employeeId,
      type:    'activity_invitation',
      title:   'Nouvelle invitation à une activité',
      message: `Vous avez été invité à participer à "${activityTitle}".`,
      link:    '/employee/invitations',
      meta:    { activityId, activityTitle },
    });
  }

  // ── Activity: employee responded → managers ────────────────────────────
  async notifyManagerActivityResponse(
    employeeId: string,
    employeeName: string,
    activityTitle: string,
    activityId: string,
    status: 'ACCEPTED' | 'DECLINED',
  ) {
    const managers = await this.usersService.findByRole('MANAGER');
    const label    = status === 'ACCEPTED' ? 'accepté' : 'décliné';
    await Promise.all(managers.map(m => this.create({
      userId:  m._id.toString(),
      type:    'activity_response',
      title:   `Réponse d'invitation`,
      message: `${employeeName} a ${label} l'invitation pour "${activityTitle}".`,
      link:    '/manager/activities',
      meta:    { employeeId, employeeName, activityId, activityTitle, status },
    })));
  }

  // ── Get my notifications ──────────────────────────────────────────────
  async getMyNotifications(userId: string) {
    const items  = await this.notifModel.find({ userId }).sort({ createdAt: -1 }).limit(40);
    const unread = items.filter(n => !n.read).length;
    return { items, unread };
  }

  // ── Unread count only ─────────────────────────────────────────────────
  async countUnread(userId: string) {
    const count = await this.notifModel.countDocuments({ userId, read: false });
    return { count };
  }

  // ── Mark one read ─────────────────────────────────────────────────────
  async markRead(notifId: string, userId: string) {
    await this.notifModel.findOneAndUpdate({ _id: notifId, userId }, { read: true });
    return this.countUnread(userId);
  }

  // ── Mark all read ─────────────────────────────────────────────────────
  async markAllRead(userId: string) {
    await this.notifModel.updateMany({ userId, read: false }, { read: true });
    return { count: 0 };
  }
}
