interface PlayerGameProps {
  onInput: (event: any) => void;
  gameInProgress?: boolean;
  latency?: number;
}

export const PlayerGame = (props: PlayerGameProps) => {
  const handleTap = () => {
    props.onInput({ action: 'tap', timestamp: Date.now() });
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: #666; background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 4px;">
        Latency: {props.latency || 0}ms
      </div>

      <h1>Tug of War</h1>

      {!props.gameInProgress ? (
        <div style="text-align: center;">
          <p style="font-size: 1.25rem; margin: 2rem 0;">Waiting for game to start...</p>
          <div style="font-size: 1rem; color: #666;">Get ready to tap!</div>
        </div>
      ) : (
        <div style="text-align: center;">
          <p>Pull your side!</p>
          <button
            onclick={handleTap}
            style="padding: 2rem 4rem; font-size: 2rem; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; user-select: none;"
          >
            TAP
          </button>
        </div>
      )}
    </div>
  );
};
