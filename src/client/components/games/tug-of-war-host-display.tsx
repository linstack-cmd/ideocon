// Tug of War host display - what the big screen shows

import { createSignal, createEffect, For } from 'solid-js';

interface TugOfWarHostDisplayProps {
  gameState: any;
  players: any[];
  onBroadcastState?: (state: any) => void;
}

export const TugOfWarHostDisplay = (props: TugOfWarHostDisplayProps) => {
  const [ropePosition, setRopePosition] = createSignal(0); // -100 to 100
  const [winner, setWinner] = createSignal<string | null>(null);

  createEffect(() => {
    // Handle incoming game_state updates from the server
    if (props.gameState?.ropePosition !== undefined) {
      setRopePosition(props.gameState.ropePosition);
    }
    if (props.gameState?.winner !== undefined) {
      setWinner(props.gameState.winner);
    }
  });

  createEffect(() => {
    // Handle tap events from controllers
    if (props.gameState?.action === 'tap' && !winner()) {
      const team = props.gameState?.team;
      
      // Move rope based on team
      // Red pulls left (negative), Blue pulls right (positive)
      const movement = team === 'red' ? -5 : team === 'blue' ? 5 : 0;
      
      setRopePosition((prev) => {
        const newPos = Math.max(-100, Math.min(100, prev + movement));
        
        // Check for winner
        let gameWinner: string | null = null;
        if (newPos <= -80) {
          gameWinner = 'Red Team Wins!';
        } else if (newPos >= 80) {
          gameWinner = 'Blue Team Wins!';
        }
        
        if (gameWinner) {
          setWinner(gameWinner);
        }
        
        // Broadcast updated game state to all players
        if (props.onBroadcastState) {
          props.onBroadcastState({
            ropePosition: newPos,
            winner: gameWinner,
          });
        }
        
        return newPos;
      });
    }
  });

  const getTeamCount = (team: 'red' | 'blue') => {
    return props.players.filter((p) => p.team === team).length;
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Tug of War</h1>

      {/* Team counts */}
      <div style="display: flex; gap: 3rem; font-size: 1.2rem; font-weight: bold;">
        <div style="color: #ff6b6b;">🔴 RED: {getTeamCount('red')}</div>
        <div style="color: #4ecdc4;">🔵 BLUE: {getTeamCount('blue')}</div>
      </div>

      {/* Rope visualization */}
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

      <div style="text-align: center; margin-top: 2rem;">
        <h2>Connected Players: {props.players.length}</h2>
        <ul style="list-style: none;">
          <For each={props.players}>
            {(player) => {
              const teamColor = player.team === 'red' ? '#ff6b6b' : player.team === 'blue' ? '#4ecdc4' : '#999';
              return (
                <li style={{
                  padding: '0.5rem 1rem',
                  background: teamColor,
                  color: 'white',
                  margin: '0.25rem',
                  'border-radius': '4px',
                  'font-weight': 'bold',
                }}>
                  🎮 {player.name || `Player (${player.id.substring(0, 8)})`} - {player.team?.toUpperCase() || 'NO TEAM'}
                </li>
              );
            }}
          </For>
        </ul>
      </div>

      {winner() && (
        <div style={{
          'font-size': '2rem',
          'font-weight': 'bold',
          color: winner() === 'Red Team Wins!' ? '#ff6b6b' : '#4ecdc4',
          'margin-top': '2rem',
          padding: '1rem',
          background: '#f0f0f0',
          'border-radius': '8px',
        }}>
          {winner()}
        </div>
      )}
    </div>
  );
};
