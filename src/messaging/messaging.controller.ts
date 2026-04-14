import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { MessagingService } from './messaging.service';

@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagingController {
  constructor(private readonly svc: MessagingService) {}

  // ── Users I can contact ────────────────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get('users')
  getUsers(@Request() req) {
    return this.svc.getContactableUsers(req.user.userId);
  }

  // ── My conversations ───────────────────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get('conversations')
  getMyConversations(@Request() req) {
    return this.svc.getMyConversations(req.user.userId);
  }

  // ── Create DM / group / announcement ──────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Post('conversations')
  createConversation(
    @Request() req,
    @Body() body: { type: string; name?: string; participants: string[] },
  ) {
    return this.svc.createConversation(
      req.user.userId,
      req.user.role,
      body.type,
      body.name || '',
      body.participants || [],
    );
  }

  // ── Get messages in a conversation ────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get('conversations/:id/messages')
  getMessages(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.svc.getMessages(
      req.user.userId,
      id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ── Send a message ─────────────────────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Post('conversations/:id/messages')
  sendMessage(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    const { userId, role } = req.user;
    const userName = req.user.name || req.user.email || userId;
    return this.svc.sendMessage(userId, userName, role, id, body.content);
  }

  // ── Mark conversation as read ──────────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Post('conversations/:id/read')
  markRead(@Request() req, @Param('id') id: string) {
    return this.svc.markRead(req.user.userId, id);
  }

  // ── Total unread badge count ───────────────────────────────────────────
  @Roles('HR', 'MANAGER', 'EMPLOYEE', 'SUPERADMIN')
  @Get('unread')
  totalUnread(@Request() req) {
    return this.svc.totalUnread(req.user.userId).then(count => ({ count }));
  }
}
