// Rope Racers controller - press and hold to grab anchors and swing

import { createSignal, createMemo } from 'solid-js';

interface RopeRacersControllerProps {
  onInput: (event: any) => void;
  latency?: number;
  color?: string | null;
  gameState?: any;
  gameEvents?: any[];
  playerId: string;
}

export const RopeRacersController = (props: RopeRacersControllerProps) => {
  const [isLocalGrabbing, setIsLocalGrabbing] = createSignal(false);

  const handleMouseDown = () => {
    setIsLocalGrabbing(true);
    props.onInput({
      action: 'grab',
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  const handleMouseUp = () => {
    setIsLocalGrabbing(false);
    props.onInput({
      action: 'release',
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  const handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    setIsLocalGrabbing(true);
    props.onInput({
      action: 'grab',
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  const handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();
    setIsLocalGrabbing(false);
    props.onInput({
      action: 'release',
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  const handleTouchCancel = (e: TouchEvent) => {
    e.preventDefault();
    setIsLocalGrabbing(false);
    props.onInput({
      action: 'release',
      playerId: props.playerId,
      timestamp: Date.now(),
    });
  };

  // Extract player position/rank from game state if available - make it reactive with createMemo
  const playerInfo = createMemo(() => {
    if (!props.gameState?.players) return { position: 0, rank: 0, totalPlayers: 0, alivePlayers: 0, isGrabbing: false, isEliminated: false };
    
    const playerData = props.gameState.players.find((p: any) => p.id === props.playerId);
    if (!playerData) return { position: 0, rank: 0, totalPlayers: props.gameState.players.length, alivePlayers: 0, isGrabbing: false, isEliminated: false };
    
    // Get rank by sorting all alive players by position
    const alivePlayers = props.gameState.players.filter((p: any) => !p.eliminated);
    const sortedByPosition = [...alivePlayers]
      .sort((a: any, b: any) => (b.position || 0) - (a.position || 0));
    
    const rank = sortedByPosition.findIndex((p: any) => p.id === props.playerId) + 1;
    
    return {
      position: Math.round(playerData.position || 0),
      rank,
      totalPlayers: props.gameState.players.length,
      alivePlayers: alivePlayers.length,
      isGrabbing: playerData.grabbing || false,
      isEliminated: playerData.eliminated || false,
    };
  });

  const getBackgroundColor = () => {
    if (playerInfo().isEliminated) {
      return 'linear-gradient(135deg, #333333 0%, #555555 100%)';
    }
    
    const baseColor = props.color || '#f5576c';
    // Create a gradient using the player's color and a slightly darker version
    const darkerColor = adjustBrightness(baseColor, -0.3);
    return `linear-gradient(135deg, ${baseColor} 0%, ${darkerColor} 100%)`;
  };

  const adjustBrightness = (hex: string, percent: number): string => {
    // Convert hex to RGB
    let num = parseInt(hex.replace("#",""), 16);
    let amt = Math.round(2.55 * percent);
    let r = (num >> 16) + amt;
    let g = (num >> 8 & 0x00FF) + amt;
    let b = (num & 0x0000FF) + amt;
    
    r = r < 0 ? 0 : r > 255 ? 255 : r;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    b = b < 0 ? 0 : b > 255 ? 255 : b;
    
    return "#" + (0x1000000 + (r<16?0:1)*r*0x10000 + (g<16?0:1)*g*0x100 + (b<16?0:1)*b).toString(16).slice(1);
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
        'background': getBackgroundColor(),
        color: 'white',
        transition: 'background 0.3s ease',
      }}
    >
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 4px;">
        Latency: {props.latency || 0}ms
      </div>

      <h1 style="text-align: center; font-size: 2.5rem; margin: 0;">Rope Racers</h1>

      <div style="text-align: center;">
        {playerInfo().isEliminated ? (
          <p style="font-size: 1.5rem; margin: 0.5rem 0; color: #ff6b6b;">YOU'RE OUT</p>
        ) : (
          <>
            <p style="font-size: 1.2rem; margin: 0.5rem 0;">Rank: <span style="font-weight: bold;">{playerInfo().rank}/{playerInfo().alivePlayers}</span></p>
            <p style="font-size: 1rem; margin: 0.5rem 0; opacity: 0.9;">Position: {playerInfo().position}m</p>
          </>
        )}
      </div>

      <div style="text-align: center;">
        <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">
          {playerInfo().isEliminated 
            ? '💀 ELIMINATED' 
            : isLocalGrabbing() 
            ? '🪢 HOLDING ROPE' 
            : '✋ HOLD TO GRAB'}
        </p>
        <button
          onmousedown={handleMouseDown}
          onmouseup={handleMouseUp}
          onmouseleave={handleMouseUp}
          ontouchstart={handleTouchStart}
          ontouchend={handleTouchEnd}
          ontouchcancel={handleTouchCancel}
          disabled={playerInfo().isEliminated}
          style={{
            padding: '2.5rem 5rem',
            'font-size': '1.8rem',
            background: playerInfo().isEliminated ? 'rgba(100,100,100,0.5)' : 'rgba(255,255,255,0.95)',
            color: playerInfo().isEliminated ? '#999999' : isLocalGrabbing() ? '#667eea' : '#f5576c',
            border: 'none',
            'border-radius': '12px',
            cursor: playerInfo().isEliminated ? 'not-allowed' : 'pointer',
            'user-select': 'none',
            'font-weight': 'bold',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease',
            transform: isLocalGrabbing() ? 'scale(0.95)' : 'scale(1)',
          }}
        >
          {playerInfo().isEliminated ? 'ELIMINATED' : isLocalGrabbing() ? 'GRABBING' : 'GRAB'}
        </button>
      </div>

      <div style="position: absolute; bottom: 2rem; text-align: center; font-size: 0.85rem; opacity: 0.8;">
        <p>Hold tight and survive!</p>
      </div>
    </div>
  );
};
