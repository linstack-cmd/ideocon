interface PlayerGameProps {
  onInput: (event: any) => void;
}

export const PlayerGame = (props: PlayerGameProps) => {
  const handleTap = () => {
    props.onInput({ action: 'tap', timestamp: Date.now() });
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem;">
      <h1>Tug of War</h1>
      <p>Pull your side!</p>
      <button
        onclick={handleTap}
        style="padding: 2rem 4rem; font-size: 2rem; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; user-select: none;"
      >
        TAP
      </button>
    </div>
  );
};
