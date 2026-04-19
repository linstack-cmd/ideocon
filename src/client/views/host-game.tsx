import { createSignal, createEffect, For } from 'solid-js';

interface HostGameProps {
  gameState: any;
  players: any[];
}

export const HostGame = (props: HostGameProps) => {
  const [ropePosition, setRopePosition] = createSignal(0); // -100 to 100
  const [tapCount, setTapCount] = createSignal(0);

  createEffect(() => {
    if (props.gameState?.action === 'tap') {
      setTapCount((prev) => prev + 1);
      // Simple rope physics: each tap moves rope slightly
      setRopePosition((prev) => Math.max(-100, Math.min(100, prev + 5)));
    }
  });

  const getWinner = () => {
    const pos = ropePosition();
    if (pos <= -80) return 'Left Team Wins!';
    if (pos >= 80) return 'Right Team Wins!';
    return null;
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Tug of War - Big Screen</h1>

      {/* Simple rope visualization */}
      <div
        style="width: 400px; height: 300px; border: 2px solid #333; position: relative; background: linear-gradient(90deg, #ff6b6b 0%, #ffffff 50%, #4ecdc4 100%);"
      >
        {/* Rope indicator */}
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${ropePosition() * 2}px)`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '80px',
            background: '#333',
            transition: 'left 0.1s ease-out',
          }}
        />
      </div>

      <div style="font-size: 1.5rem; font-weight: bold;">Position: {ropePosition().toFixed(0)}</div>
      <div style="font-size: 1.25rem;">Taps: {tapCount()}</div>

      <div style="text-align: center; margin-top: 2rem;">
        <h2>Connected Players: {props.players.length}</h2>
        <ul style="list-style: none;">
          <For each={props.players}>
            {(player) => (
              <li style="padding: 0.5rem; background: #e9ecef; margin: 0.25rem; border-radius: 4px;">
                🎮 {player.name || `Player (${player.id.substring(0, 8)})`}
              </li>
            )}
          </For>
        </ul>
      </div>

      {getWinner() && (
        <div style="font-size: 2rem; font-weight: bold; color: #28a745; margin-top: 2rem;">
          {getWinner()}
        </div>
      )}
    </div>
  );
};
