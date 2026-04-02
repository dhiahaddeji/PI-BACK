import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

// NOTE: @Injectable() is intentionally omitted — @WebSocketGateway() already registers
// this class as a provider. Adding @Injectable() on top overrides the gateway metadata
// and prevents @WebSocketServer() from being injected properly.
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  // ── Each authenticated user joins their own room ──────────────────────
  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) { client.disconnect(); return; }

      // Use the secret configured in JwtModule (not a manual override)
      const payload = this.jwtService.verify(token);

      client.data.userId = payload.sub;
      client.data.role   = payload.role;

      client.join(`user:${payload.sub}`);
      if (payload.role) client.join(`role:${payload.role}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) { /* rooms cleaned automatically */ }

  // ── Push a notification to one user ──────────────────────────────────
  emitNotification(userId: string, notification: any) {
    if (!this.server) return; // guard: server not ready yet
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  // ── Broadcast to all users of a given role ────────────────────────────
  emitToRole(role: string, event: string, payload: any) {
    if (!this.server) return;
    this.server.to(`role:${role}`).emit(event, payload);
  }
}
