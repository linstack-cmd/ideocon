// Tug of War controller UI - what players see and interact with

interface TugOfWarControllerProps {
  onInput: (event: any) => void;
  latency?: number;
}

export const TugOfWarController = (props: TugOfWarControllerProps) => {
  const handleTap = () => {
    props.onInput({ action: 'tap', timestamp: Date.now() });
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <div style="position: absolute; top: 1rem; right: 1rem; font-size: 0.9rem; color: #666; background: #f0f0f0; padding: 0.5rem 1rem; border-radius: 4px;">
        Latency: {props.latency || 0}ms
      </div>

      <h1>Tug of War</h1>

      <div style="text-align: center;">
        <p>Pull your side!</p>
        <button
          onclick={handleTap}
          style="padding: 2rem 4rem; font-size: 2rem; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; user-select: none;"
        >
          TAP
        </button>
      </div>
    </div>
  );
};
