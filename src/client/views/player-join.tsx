import { createSignal, createEffect } from 'solid-js';

interface PlayerJoinProps {
  onJoin: (code: string) => void;
  onHostCreate: () => void;
  connected?: boolean;
}

export const PlayerJoin = (props: PlayerJoinProps) => {
  const [code, setCode] = createSignal('');
  const [autoJoinPending, setAutoJoinPending] = createSignal(false);
  const [autoJoinCode, setAutoJoinCode] = createSignal<string | null>(null);

  // Check for code in URL query parameter
  createEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const codeParam = searchParams.get('code');
    if (codeParam && codeParam.trim()) {
      setCode(codeParam.toUpperCase());
      setAutoJoinCode(codeParam.toUpperCase());
      setAutoJoinPending(true);
    }
  });

  // Auto-join once WebSocket is connected
  createEffect(() => {
    if (autoJoinPending() && props.connected && autoJoinCode()) {
      props.onJoin(autoJoinCode()!);
      setAutoJoinPending(false);
    }
  });

  const handleSubmit = () => {
    if (code().trim()) {
      props.onJoin(code().toUpperCase());
    }
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      <h1>Ideocon</h1>
      
      <div style="display: flex; flex-direction: column; gap: 1rem; align-items: center;">
        <div>
          <h2 style="margin: 0 0 1rem 0; text-align: center;">Player</h2>
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
            style="display: block; margin-top: 1rem; padding: 0.75rem 1.5rem; font-size: 1.25rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; width: 100%;"
          >
            Join Game
          </button>
        </div>

        <div style="width: 100%; text-align: center; color: #666;">
          or
        </div>

        <div>
          <h2 style="margin: 0 0 1rem 0; text-align: center;">Host</h2>
          <button
            onclick={() => props.onHostCreate()}
            style="padding: 0.75rem 1.5rem; font-size: 1.25rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; width: 200px;"
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  );
};
