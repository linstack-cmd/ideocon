import { randomBytes } from 'crypto';
import type { RoomState, Player, ClientMessage, ServerMessage } from '../shared/types.js';
import { WebSocket } from 'ws';

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private connectionToRoom = new Map<WebSocket, string>();
  private connectionToPlayerId = new Map<WebSocket, string>();

  createRoom(): string {
    const code = this.generateRoomCode();
    this.rooms.set(code, {
      code,
      host: null,
      players: [],
      gameId: null,
      gameInProgress: false,
      createdAt: Date.now(),
    });
    return code;
  }

  joinRoom(
    ws: WebSocket,
    roomCode: string,
    playerType: 'host' | 'controller',
    sessionToken?: string,
    name?: string
  ): { ok: boolean; error?: string; room?: RoomState; playerId?: string } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, error: 'Room not found' };
    }

    const playerId = this.generatePlayerId();
    const player: Player = {
      id: playerId,
      sessionToken: sessionToken || this.generateSessionToken(),
      playerType,
      connectionId: playerId,
      joinedAt: Date.now(),
      name: name && name.trim() ? name.trim() : undefined,
    };

    if (playerType === 'host') {
      if (room.host) {
        return { ok: false, error: 'Room already has a host' };
      }
      room.host = player;
    } else {
      room.players.push(player);
    }

    this.connectionToRoom.set(ws, roomCode);
    this.connectionToPlayerId.set(ws, playerId);

    return { ok: true, room, playerId };
  }

  leaveRoom(ws: WebSocket): string | null {
    const roomCode = this.connectionToRoom.get(ws);
    const playerId = this.connectionToPlayerId.get(ws);

    if (!roomCode || !playerId) return null;

    const room = this.rooms.get(roomCode);
    if (room) {
      if (room.host?.id === playerId) {
        room.host = null;
      } else {
        room.players = room.players.filter((p) => p.id !== playerId);
      }

      // Clean up empty rooms
      if (!room.host && room.players.length === 0) {
        this.rooms.delete(roomCode);
      }
    }

    this.connectionToRoom.delete(ws);
    this.connectionToPlayerId.delete(ws);

    return roomCode;
  }

  getRoom(roomCode: string): RoomState | null {
    return this.rooms.get(roomCode) || null;
  }

  startGame(roomCode: string, gameId: string): boolean {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return false;
    }
    room.gameId = gameId;
    room.gameInProgress = true;
    return true;
  }

  getRoomForConnection(ws: WebSocket): RoomState | null {
    const roomCode = this.connectionToRoom.get(ws);
    return roomCode ? this.rooms.get(roomCode) || null : null;
  }

  getPlayerIdForConnection(ws: WebSocket): string | null {
    return this.connectionToPlayerId.get(ws) || null;
  }

  broadcastToRoom(
    roomCode: string,
    message: ServerMessage,
    excludeWs?: WebSocket
  ): WebSocket[] {
    const recipients: WebSocket[] = [];
    this.connectionToRoom.forEach((code, ws) => {
      if (code === roomCode && ws !== excludeWs) {
        try {
          ws.send(JSON.stringify(message));
          recipients.push(ws);
        } catch (err) {
          // Connection may be closed
        }
      }
    });
    return recipients;
  }

  sendToConnection(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      // Connection may be closed
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  private generatePlayerId(): string {
    return randomBytes(8).toString('hex');
  }

  private generateSessionToken(): string {
    return randomBytes(16).toString('hex');
  }
}
