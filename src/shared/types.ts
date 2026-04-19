// WebSocket message types for room and game communication

export type ClientMessage =
  | { type: 'join'; roomCode?: string; playerType: 'host' | 'controller'; sessionToken?: string }
  | { type: 'input'; gameEvent: GameInputEvent }
  | { type: 'pong' };

export type ServerMessage =
  | { type: 'join_ok'; roomCode: string; playerId: string; players: PlayerInfo[] }
  | { type: 'join_error'; reason: string }
  | { type: 'player_joined'; playerId: string; playerInfo: PlayerInfo }
  | { type: 'player_left'; playerId: string }
  | { type: 'game_state'; state: GameState }
  | { type: 'game_event'; event: GameEvent }
  | { type: 'ping' };

export interface RoomState {
  code: string;
  host: Player | null;
  players: Player[];
  gameId: string | null;
  createdAt: number;
}

export interface Player {
  id: string;
  sessionToken: string;
  playerType: 'host' | 'controller';
  connectionId: string;
  joinedAt: number;
}

export interface PlayerInfo {
  id: string;
  playerType: 'host' | 'controller';
  joinedAt: number;
}

export type GameInputEvent = {
  gameId: string;
} & Record<string, unknown>;

export type GameEvent = {
  gameId: string;
} & Record<string, unknown>;

export type GameState = {
  gameId: string;
} & Record<string, unknown>;
