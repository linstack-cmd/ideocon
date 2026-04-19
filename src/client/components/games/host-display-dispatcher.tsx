// Host display dispatcher - routes to the correct game's host display based on gameId

import { Match, Switch } from 'solid-js';
import { TugOfWarHostDisplay } from './tug-of-war-host-display.js';

interface HostDisplayDispatcherProps {
  gameId: string | null;
  gameState: any;
  players: any[];
}

export const HostDisplayDispatcher = (props: HostDisplayDispatcherProps) => {
  return (
    <Switch>
      {/* Tug of War */}
      <Match when={props.gameId === 'tug-of-war'}>
        <TugOfWarHostDisplay 
          gameState={props.gameState}
          players={props.players}
        />
      </Match>

      {/* Fallback for unknown game */}
      <Match when={true}>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 2rem; padding: 2rem;">
          <h1>Unknown Game</h1>
          <p>The game "{props.gameId}" is not recognized.</p>
        </div>
      </Match>
    </Switch>
  );
};
