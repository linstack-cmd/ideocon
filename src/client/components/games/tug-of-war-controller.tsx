// Tug of War controller UI - what players see and interact with

interface TugOfWarControllerProps {
  onInput: (event: any) => void;
  latency?: number;
  team?: 'red' | 'blue' | null;
}

export const TugOfWarController = (props: TugOfWarControllerProps) => {
  const handleTap = () => {
    props.onInput({ 
      action: 'tap', 
      timestamp: Date.now(),
      team: props.team,
    });
  };

  const teamColor = () => props.team === 'red' ? '#ff6b6b' : props.team === 'blue' ? '#4ecdc4' : '#999';
  const teamLabel = () => props.team === 'red' ? 'RED TEAM' : props.team === 'blue' ? 'BLUE TEAM' : 'NO TEAM';

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
        'background-color': teamColor(),
        color: 'white',
      }}
    >
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.9rem;">
        Latency: {props.latency || 0}ms
      </div>

      <h1 style="text-align: center; font-size: 2.5rem; margin: 0;">Tug of War</h1>

      <div style="text-align: center; padding: 1.5rem; background: rgba(0,0,0,0.2); border-radius: 8px; font-size: 1.5rem; font-weight: bold;">
        {teamLabel()}
      </div>

      <div style="text-align: center;">
        <p style="font-size: 1.3rem; margin-bottom: 1rem;">Pull your side!</p>
        <button
          onclick={handleTap}
          style={{
            padding: '2rem 4rem',
            'font-size': '2rem',
            background: 'rgba(255,255,255,0.95)',
            color: teamColor(),
            border: 'none',
            'border-radius': '8px',
            cursor: 'pointer',
            'user-select': 'none',
            'font-weight': 'bold',
            'box-shadow': '0 4px 8px rgba(0,0,0,0.2)',
          }}
        >
          TAP
        </button>
      </div>
    </div>
  );
};
