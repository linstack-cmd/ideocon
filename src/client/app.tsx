import { createSignal, createEffect, Match, Show, Switch } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { WebSocketClient } from './ws-client.js';
import type { ServerMessage } from '../shared/types.js';
import { HostLobby } from './views/host-lobby.js';
import { HostGame } from './views/host-game.js';
import { PlayerJoin } from './views/player-join.js';
import { PlayerGame } from './views/player-game.js';

export const App = () => {
  const navigate = useNavigate();
  const params = useParams<{ roomCode?: string; view?: string }>();

  const [ws, setWs] = createSignal<WebSocketClient | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [view, setView] = createSignal<'join' | 'host-lobby' | 'host-game' | 'player-game'>('join');
  const [roomCode, setRoomCode] = createSignal<string>('');
  const [playerId, setPlayerId] = createSignal<string>('');
  const [playerType, setPlayerType] = createSignal<'host' | 'controller'>('controller');
  const [players, setPlayers] = createSignal<any[]>([]);
  const [gameState, setGameState] = createSignal<any>(null);
  const [selectedGameId, setSelectedGameId] = createSignal<string | null>(null);
  const [gameInProgress, setGameInProgress] = createSignal(false);
  const [latency, setLatency] = createSignal(0);

  // Initialize WebSocket and routing based on URL
  createEffect(() => {
    const client = new WebSocketClient();

    const messageHandler = (msg: ServerMessage) => {
      switch (msg.type) {
        case 'join_ok':
          setRoomCode(msg.roomCode);
          setPlayerId(msg.playerId);
          setPlayerType(msg.playerType);
          setPlayers(msg.players);
          setGameInProgress(msg.gameInProgress);

          // Determine view based on our own player type from the response
          if (msg.playerType === 'host') {
            setView('host-lobby');
          } else {
            if (msg.gameInProgress) {
              setView('player-game');
            } else {
              setView('player-game');
            }
          }
          break;

        case 'player_joined':
          // Only add controller-type players, not hosts
          if (msg.playerInfo.playerType !== 'host') {
            setPlayers((prev) => [...prev, msg.playerInfo]);
          }
          break;

        case 'player_left':
          setPlayers((prev) => prev.filter((p) => p.id !== msg.playerId));
          break;

        case 'game_started':
          setSelectedGameId(msg.gameId);
          setGameInProgress(true);
          // Transition host to game view
          if (playerType() === 'host') {
            setView('host-game');
          }
          break;

        case 'game_event':
          setGameState((prev: any) => ({
            ...prev,
            ...msg.event,
          }));
          break;

        case 'join_error':
          console.error('Join error:', msg.reason);
          break;
      }
    };

    const latencyHandler = (l: number) => {
      setLatency(l);
    };

    client.onMessage(messageHandler);
    client.onLatency(latencyHandler);
    
    // Set up connection state tracking with polling
    const connectionCheckInterval = setInterval(() => {
      setConnected(client.isConnected());
    }, 100);
    
    client.connect();
    setWs(client);

    return () => {
      clearInterval(connectionCheckInterval);
      client.disconnect();
      setConnected(false);
    };
  });

  const handleHostCreate = async () => {
    const client = ws();
    if (client) {
      client.send({ type: 'join', playerType: 'host' });
    }
  };

  const handlePlayerJoin = async (code: string, name?: string) => {
    const client = ws();
    if (client) {
      client.send({ type: 'join', roomCode: code, playerType: 'controller', name });
    }
  };

  const handleStartGame = (gameId: string) => {
    const client = ws();
    if (client) {
      setSelectedGameId(gameId);
      client.send({ type: 'start_game', gameId });
    }
  };

  const handleGameInput = (gameEvent: any) => {
    const client = ws();
    const gameId = selectedGameId();
    if (client && gameId) {
      client.send({
        type: 'input',
        gameEvent: {
          gameId,
          ...gameEvent,
        },
      });
    }
  };

  return (
    <div style="width: 100%; height: 100%;">
      <Switch>
        <Match when={view() === 'join'}>
          <PlayerJoin onJoin={handlePlayerJoin} onHostCreate={handleHostCreate} connected={connected()} />
        </Match>
        <Match when={view() === 'host-lobby'}>
          <HostLobby
            roomCode={roomCode()}
            players={players()}
            onStartGame={handleStartGame}
          />
        </Match>
        <Match when={view() === 'host-game'}>
          <HostGame gameState={gameState()} players={players()} />
        </Match>
        <Match when={view() === 'player-game'}>
          <PlayerGame 
            onInput={handleGameInput} 
            gameInProgress={gameInProgress()}
            latency={latency()}
          />
        </Match>
      </Switch>
    </div>
  );
};
