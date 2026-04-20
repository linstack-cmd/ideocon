// WebSocket message types for room and game communication

export type ClientMessage =
  | { type: 'join'; roomCode?: string; playerType: 'host' | 'controller'; sessionToken?: string; name?: string }
  | { type: 'input'; gameEvent: GameInputEvent }
  | { type: 'pong' }
  | { type: 'start_game'; gameId: string }
  | { type: 'ping'; id: string; timestamp: number }
  | { type: 'game_state'; state: GameState };

export type ServerMessage =
  | { type: 'join_ok'; roomCode: string; playerId: string; playerType: 'host' | 'controller'; players: PlayerInfo[]; gameInProgress: boolean; team?: 'red' | 'blue' }
  | { type: 'join_error'; reason: string }
  | { type: 'player_joined'; playerId: string; playerInfo: PlayerInfo }
  | { type: 'player_left'; playerId: string }
  | { type: 'game_state'; state: GameState }
  | { type: 'game_event'; event: GameEvent }
  | { type: 'game_started'; gameId: string }
  | { type: 'ping' }
  | { type: 'pong'; id: string; timestamp: number };

export interface RoomState {
  code: string;
  host: Player | null;
  players: Player[];
  gameId: string | null;
  gameInProgress: boolean;
  createdAt: number;
}

export interface Player {
  id: string;
  sessionToken: string;
  playerType: 'host' | 'controller';
  connectionId: string;
  joinedAt: number;
  name?: string;
  team?: 'red' | 'blue'; // only for controllers
}

export interface PlayerInfo {
  id: string;
  playerType: 'host' | 'controller';
  joinedAt: number;
  name?: string;
  team?: 'red' | 'blue'; // only for controllers
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

export interface GameCatalog {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}

export const GAMES: GameCatalog[] = [
  {
    id: 'tug-of-war',
    name: 'Tug of War',
    description: 'Pull your side to victory!',
    minPlayers: 2,
    maxPlayers: 999,
  },
];
