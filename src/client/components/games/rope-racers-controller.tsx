// Rope Racers controller - tap to grab anchors and swing

import { createSignal } from 'solid-js';

interface RopeRacersControllerProps {
  onInput: (event: any) => void;
  latency?: number;
  gameState?: any;
  gameEvents?: any[];
  playerId: string;
}

export const RopeRacersController = (props: RopeRacersControllerProps) => {
  const [isGrabbed, setIsGrabbed] = createSignal(false);

  const handleTap = () => {
    const action = isGrabbed() ? 'release' : 'grab';
    setIsGrabbed(!isGrabbed());
    
    props.onInput({
      action,
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  // Extract player position/rank from game state if available
  // This is a getter function so it re-evaluates whenever gameState changes
  const getPlayerInfo = () => {
    if (!props.gameState?.players) return { position: 0, rank: 0, totalPlayers: 0 };
    
    const playerData = props.gameState.players.find((p: any) => p.id === props.playerId);
    if (!playerData) return { position: 0, rank: 0, totalPlayers: props.gameState.players.length };
    
    // Get rank by sorting all players by position
    const sortedByPosition = [...props.gameState.players]
      .sort((a: any, b: any) => (b.position || 0) - (a.position || 0));
    
    const rank = sortedByPosition.findIndex((p: any) => p.id === props.playerId) + 1;
    
    return {
      position: Math.round(playerData.position || 0),
      rank,
      totalPlayers: props.gameState.players.length,
    };
  };

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        height: '100%',
        gap: '2rem',
        padding: '2rem',
        'background': isGrabbed() 
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        color: 'white',
        transition: 'background 0.3s ease',
      }}
    >
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 4px;">
        Latency: {props.latency || 0}ms
      </div>

      <h1 style="text-align: center; font-size: 2.5rem; margin: 0;">Rope Racers</h1>

      <div style="text-align: center;">
        <p style="font-size: 1.2rem; margin: 0.5rem 0;">Rank: <span style="font-weight: bold;">{getPlayerInfo().rank}/{getPlayerInfo().totalPlayers}</span></p>
        <p style="font-size: 1rem; margin: 0.5rem 0; opacity: 0.9;">Position: {getPlayerInfo().position}m</p>
      </div>

      <div style="text-align: center;">
        <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">
          {isGrabbed() ? '🪢 HOLDING ROPE' : '✋ TAP TO GRAB'}
        </p>
        <button
          onclick={handleTap}
          style={{
            padding: '2.5rem 5rem',
            'font-size': '1.8rem',
            background: 'rgba(255,255,255,0.95)',
            color: isGrabbed() ? '#667eea' : '#f5576c',
            border: 'none',
            'border-radius': '12px',
            cursor: 'pointer',
            'user-select': 'none',
            'font-weight': 'bold',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease',
            transform: 'scale(1)',
          }}
          onmousedown={(e) => {
            const target = e.currentTarget as HTMLButtonElement;
            target.style.transform = 'scale(0.95)';
          }}
          onmouseup={(e) => {
            const target = e.currentTarget as HTMLButtonElement;
            target.style.transform = 'scale(1)';
          }}
        >
          {isGrabbed() ? 'RELEASE' : 'GRAB'}
        </button>
      </div>

      <div style="position: absolute; bottom: 2rem; text-align: center; font-size: 0.85rem; opacity: 0.8;">
        <p>Timing is everything!</p>
      </div>
    </div>
  );
};
