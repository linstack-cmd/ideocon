// Generic waiting state - shown before a game starts

interface WaitingStateProps {
  latency?: number;
}

export const WaitingState = (props: WaitingStateProps) => {
  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: #666; background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 4px;">
        Latency: {props.latency || 0}ms
      </div>

      <h1>Game Starting Soon</h1>

      <div style="text-align: center;">
        <p style="font-size: 1.25rem; margin: 2rem 0;">Waiting for the host to start a game...</p>
        <div style="font-size: 1rem; color: #666;">Get ready!</div>
      </div>
    </div>
  );
};
