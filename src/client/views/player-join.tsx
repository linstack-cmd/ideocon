import { createSignal } from 'solid-js';

interface PlayerJoinProps {
  onJoin: (code: string) => void;
}

export const PlayerJoin = (props: PlayerJoinProps) => {
  const [code, setCode] = createSignal('');

  const handleSubmit = () => {
    if (code().trim()) {
      props.onJoin(code().toUpperCase());
    }
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Join Game</h1>
      <input
        type="text"
        placeholder="Enter room code"
        value={code()}
        onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
        style="padding: 0.5rem; font-size: 1.5rem; width: 200px; text-align: center;"
      />
      <button
        onclick={handleSubmit}
        style="padding: 0.75rem 1.5rem; font-size: 1.25rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;"
      >
        Join
      </button>
    </div>
  );
};
