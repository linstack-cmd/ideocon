// Tug of War host display - what the big screen shows

import { createSignal, createEffect, For, onCleanup, onMount } from 'solid-js';

interface TugOfWarHostDisplayProps {
  gameState: any;
  players: any[];
  onBroadcastState?: (state: any) => void;
  onPlayAgain?: () => void;
}

export const TugOfWarHostDisplay = (props: TugOfWarHostDisplayProps) => {
  const [ropePosition, setRopePosition] = createSignal(0); // -100 to 100
  const [winner, setWinner] = createSignal<string | null>(null);
  const [windowWidth, setWindowWidth] = createSignal(window.innerWidth);
  const [windowHeight, setWindowHeight] = createSignal(window.innerHeight);

  onMount(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    
    window.addEventListener('resize', handleResize);
    onCleanup(() => window.removeEventListener('resize', handleResize));
  });

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

  // Calculate rope visualization size dynamically
  const ropeHeight = Math.min(400, windowHeight() - 200);
  const ropeWidth = Math.min(600, windowWidth() - 100);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      display: 'flex',
      'flex-direction': 'column',
      'align-items': 'center',
      'justify-content': 'center',
      gap: '2rem',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
    }}>
      <h1 style="color: white; font-size: 3rem; margin: 1rem 0 0 0;">Tug of War</h1>

      {/* Team counts */}
      <div style="display: flex; gap: 3rem; font-size: 1.5rem; font-weight: bold; color: white;">
        <div style="color: #ff6b6b;">🔴 RED: {getTeamCount('red')}</div>
        <div style="color: #4ecdc4;">🔵 BLUE: {getTeamCount('blue')}</div>
      </div>

      {/* Rope visualization - scaled to fit window */}
      <div
        style={{
          width: `${ropeWidth}px`,
          height: `${ropeHeight}px`,
          border: '3px solid #333',
          position: 'relative',
          background: 'linear-gradient(90deg, #ff6b6b 0%, #ffffff 50%, #4ecdc4 100%)',
          'border-radius': '8px',
          'box-shadow': '0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        {/* Rope indicator */}
        <div
          style={{
            position: 'absolute',
            left: `calc(50% + ${ropePosition() * (ropeWidth / 200)}px)`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '30px',
            height: `${ropeHeight * 0.6}px`,
            background: '#000',
            'border-radius': '4px',
            transition: 'left 0.1s ease-out',
          }}
        />
      </div>

      <div style="font-size: 1.8rem; font-weight: bold; color: white;">Position: {ropePosition().toFixed(0)}</div>

      {/* Connected players list */}
      <div style="text-align: center;">
        <h2 style="color: white; font-size: 1.5rem;">Players: {props.players.length}</h2>
        <ul style={{
          'list-style': 'none',
          display: 'flex',
          gap: '1rem',
          'flex-wrap': 'wrap',
          'justify-content': 'center',
          'max-width': '90vw',
          margin: 0,
          padding: 0,
        }}>
          <For each={props.players}>
            {(player) => {
              const teamColor = player.team === 'red' ? '#ff6b6b' : player.team === 'blue' ? '#4ecdc4' : '#999';
              return (
                <li style={{
                  padding: '0.75rem 1.5rem',
                  background: teamColor,
                  color: 'white',
                  'border-radius': '6px',
                  'font-weight': 'bold',
                  'font-size': '1.1rem',
                }}>
                  🎮 {player.name || `Player (${player.id.substring(0, 8)})`}
                </li>
              );
            }}
          </For>
        </ul>
      </div>

      {/* Winner overlay */}
      {winner() && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '3rem',
          background: 'rgba(0,0,0,0.8)',
          'pointer-events': 'none',
          'z-index': 100,
        }}>
          <div style={{
            'font-size': '4rem',
            'font-weight': 'bold',
            color: winner() === 'Red Team Wins!' ? '#ff6b6b' : '#4ecdc4',
            'text-shadow': '0 0 20px rgba(0,0,0,0.8)',
            'text-align': 'center',
          }}>
            {winner()}
          </div>
          
          <button
            onClick={() => props.onPlayAgain?.()}
            style={{
              padding: '1rem 2.5rem',
              'font-size': '1.3rem',
              'font-weight': 'bold',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              'border-radius': '8px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              'pointer-events': 'auto',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#45a049')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#4CAF50')}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};
