import { For, createSignal } from 'solid-js';
import { QRCode } from '../components/qr-code';
import { GAMES } from '../../shared/types.js';

interface HostLobbyProps {
  roomCode: string;
  players: any[];
  onStartGame: (gameId: string) => void;
}

export const HostLobby = (props: HostLobbyProps) => {
  const [selectedGameId, setSelectedGameId] = createSignal<string | null>(null);
  const [copyFeedback, setCopyFeedback] = createSignal('');

  const getJoinUrl = () => {
    const origin = window.location.origin;
    return `${origin}/?code=${props.roomCode}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getJoinUrl());
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  };

  const handleStartGame = () => {
    const gameId = selectedGameId();
    if (gameId) {
      props.onStartGame(gameId);
    }
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Game Lobby</h1>
      
      <div style="text-align: center;">
        <h2>Join Using QR Code</h2>
        <QRCode value={getJoinUrl()} size={256} />
        <button
          onclick={handleCopyLink}
          style="display: block; margin-top: 1rem; padding: 0.5rem 1rem; font-size: 0.9rem; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          {copyFeedback() ? copyFeedback() : 'Copy Link'}
        </button>
      </div>

      <div style="font-size: 2rem; font-weight: bold; color: #007bff;">
        Room Code: {props.roomCode}
      </div>

      <div style="text-align: center;">
        <h2>Select Game</h2>
        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <For each={GAMES}>
            {(game) => (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  border: selectedGameId() === game.id ? '2px solid #007bff' : '1px solid #ddd',
                  'border-radius': '4px',
                  cursor: 'pointer',
                  background: selectedGameId() === game.id ? '#e7f3ff' : '#fff',
                  'min-width': '150px',
                  'text-align': 'center',
                }}
                onclick={() => setSelectedGameId(game.id)}
              >
                <div style="font-weight: bold; margin-bottom: 0.25rem;">{game.name}</div>
                <div style="font-size: 0.85rem; color: #666;">{game.description}</div>
                <div style="font-size: 0.75rem; color: #999; margin-top: 0.25rem;">
                  {game.minPlayers}-{game.maxPlayers === 999 ? '∞' : game.maxPlayers} players
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div style="text-align: center;">
        <h2>Connected Players: {props.players.length}</h2>
        <ul style="list-style: none; margin-top: 1rem;">
          <For each={props.players}>
            {(player) => (
              <li style="padding: 0.5rem; background: #e9ecef; margin: 0.25rem; border-radius: 4px;">
                🎮 {player.name || `Player (${player.id.substring(0, 8)})`}
              </li>
            )}
          </For>
        </ul>
      </div>
      <button
        onclick={handleStartGame}
        disabled={props.players.length < 2 || !selectedGameId()}
        style={{
          padding: '0.75rem 1.5rem',
          'font-size': '1.25rem',
          background: '#28a745',
          color: 'white',
          border: 'none',
          'border-radius': '4px',
          cursor: 'pointer',
          opacity: props.players.length < 2 || !selectedGameId() ? 0.5 : 1,
        }}
      >
        Start Game
      </button>
    </div>
  );
};
