import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.js';
import { RoomManager } from './room-manager.js';

export class WebSocketHandler {
  private ws: WebSocket;
  private roomManager: RoomManager;
  private currentRoomCode: string | null = null;
  private messageCount = 0;
  private messageWindowStart = Date.now();
  private readonly MAX_MESSAGES_PER_SECOND = 30;

  constructor(ws: WebSocket, roomManager: RoomManager) {
    this.ws = ws;
    this.roomManager = roomManager;
  }

  init(): void {
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('error', (err) => console.error('WebSocket error:', err));
  }

  private handleMessage(data: unknown): void {
    try {
      // Rate limiting
      if (!this.checkRateLimit()) {
        return;
      }

      const message = JSON.parse(data as string) as ClientMessage;

      switch (message.type) {
        case 'join':
          this.handleJoin(message);
          break;
        case 'input':
          this.handleInput(message);
          break;
        case 'pong':
          // Keep-alive response
          break;
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  }

  private handleJoin(message: Extract<ClientMessage, { type: 'join' }>): void {
    const { roomCode, playerType, sessionToken } = message;

    let actualRoomCode: string;

    // If host and no room code provided, create a new room
    if (playerType === 'host' && !roomCode) {
      actualRoomCode = this.roomManager.createRoom();
    } else {
      actualRoomCode = roomCode || '';
    }

    const result = this.roomManager.joinRoom(this.ws, actualRoomCode, playerType, sessionToken);

    if (!result.ok) {
      this.roomManager.sendToConnection(this.ws, {
        type: 'join_error',
        reason: result.error || 'Unknown error',
      });
      return;
    }

    this.currentRoomCode = actualRoomCode;

    // Send confirmation to the joining client
    // Note: The players array contains only controllers, not the host.
    // The host is conveyed via playerId and the client determines their role.
    const playerInfoList = result.room!.players.map((p) => ({
      id: p.id,
      playerType: p.playerType,
      joinedAt: p.joinedAt,
    }));

    this.roomManager.sendToConnection(this.ws, {
      type: 'join_ok',
      roomCode: actualRoomCode,
      playerId: result.playerId!,
      playerType,
      players: playerInfoList,
    });

    // Notify other clients in the room about the new player
    this.roomManager.broadcastToRoom(
      actualRoomCode,
      {
        type: 'player_joined',
        playerId: result.playerId!,
        playerInfo: {
          id: result.playerId!,
          playerType,
          joinedAt: Date.now(),
        },
      },
      this.ws
    );
  }

  private handleInput(message: Extract<ClientMessage, { type: 'input' }>): void {
    if (!this.currentRoomCode) {
      return;
    }

    const room = this.roomManager.getRoom(this.currentRoomCode);
    if (!room) {
      return;
    }

    // Relay game input to all clients in the room except the sender
    this.roomManager.broadcastToRoom(
      this.currentRoomCode,
      {
        type: 'game_event',
        event: message.gameEvent,
      },
      this.ws
    );
  }

  private handleClose(): void {
    if (this.currentRoomCode) {
      // Capture playerId before leaveRoom deletes it from the map
      const playerId = this.roomManager.getPlayerIdForConnection(this.ws);
      const roomCode = this.roomManager.leaveRoom(this.ws);
      if (roomCode && playerId) {
        this.roomManager.broadcastToRoom(roomCode, {
          type: 'player_left',
          playerId,
        });
      }
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const timeSinceWindow = now - this.messageWindowStart;

    if (timeSinceWindow >= 1000) {
      // Reset window
      this.messageCount = 1;
      this.messageWindowStart = now;
      return true;
    }

    this.messageCount++;
    if (this.messageCount > this.MAX_MESSAGES_PER_SECOND) {
      console.warn(`Rate limit exceeded for connection`);
      return false;
    }

    return true;
  }
}
