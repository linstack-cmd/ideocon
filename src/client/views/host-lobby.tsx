import { For } from 'solid-js';
import { QRCode } from '../components/qr-code';

interface HostLobbyProps {
  roomCode: string;
  players: any[];
  onStartGame: () => void;
}

export const HostLobby = (props: HostLobbyProps) => {
  const getJoinUrl = () => {
    const origin = window.location.origin;
    return `${origin}/?code=${props.roomCode}`;
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Game Lobby</h1>
      
      <div style="text-align: center;">
        <h2>Join Using QR Code</h2>
        <QRCode value={getJoinUrl()} size={256} />
      </div>

      <div style="font-size: 2rem; font-weight: bold; color: #007bff;">
        Room Code: {props.roomCode}
      </div>

      <div style="text-align: center;">
        <h2>Connected Players: {props.players.length}</h2>
        <ul style="list-style: none; margin-top: 1rem;">
          <For each={props.players}>
            {(player) => (
              <li style="padding: 0.5rem; background: #e9ecef; margin: 0.25rem; border-radius: 4px;">
                🎮 Player ({player.id.substring(0, 8)})
              </li>
            )}
          </For>
        </ul>
      </div>
      <button
        onclick={() => props.onStartGame()}
        disabled={props.players.length < 2}
        style="padding: 0.75rem 1.5rem; font-size: 1.25rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        Start Game
      </button>
    </div>
  );
};
