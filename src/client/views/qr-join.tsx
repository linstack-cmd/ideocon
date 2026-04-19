import { createSignal, Show } from 'solid-js';

interface QRJoinProps {
  code: string;
  onJoin: (code: string, name: string) => void;
  connected?: boolean;
  joinError?: string;
}

export const QRJoin = (props: QRJoinProps) => {
  const [name, setName] = createSignal('');

  const handleSubmit = () => {
    if (name().trim()) {
      if (!props.connected) {
        return;
      }
      props.onJoin(props.code, name().trim());
    }
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
      {/* Error Messages and Connection Status */}
      <div style="height: 3rem; display: flex; flex-direction: column; justify-content: center; gap: 0.5rem; text-align: center;">
        <Show when={!props.connected}>
          <div style="color: #666; font-size: 0.9rem;">
            Connecting...
          </div>
        </Show>
        <Show when={props.joinError}>
          <div style="color: #dc3545; font-size: 0.9rem; font-weight: bold;">
            Error: {props.joinError}
          </div>
        </Show>
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem; align-items: center;">
        <div>
          <h2 style="margin: 0 0 1rem 0; text-align: center;">What's your name?</h2>
          <input
            type="text"
            placeholder="Enter your name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            maxlength="20"
            style="padding: 0.5rem; font-size: 1rem; width: 200px; text-align: center; display: block; margin-bottom: 0.5rem;"
            autofocus
          />
          <button
            onclick={handleSubmit}
            disabled={!name().trim() || !props.connected}
            style={{
              display: 'block',
              'margin-top': '1rem',
              padding: '0.75rem 1.5rem',
              'font-size': '1.25rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              'border-radius': '4px',
              cursor: !name().trim() || !props.connected ? 'not-allowed' : 'pointer',
              width: '100%',
              opacity: !name().trim() || !props.connected ? 0.5 : 1,
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
};
