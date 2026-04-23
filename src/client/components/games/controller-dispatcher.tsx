// Controller dispatcher - routes to the correct game's controller UI based on gameId

import { Match, Switch } from 'solid-js';
import { WaitingState } from './waiting-state.js';
import { TugOfWarController } from './tug-of-war-controller.js';
import { RopeRacersController } from './rope-racers-controller.js';

interface ControllerDispatcherProps {
  gameId: string | null;
  gameInProgress: boolean;
  onInput: (event: any) => void;
  latency?: number;
  team?: 'red' | 'blue' | null;
  playerId?: string;
  gameState?: any;
  gameEvents?: any[];
}

export const ControllerDispatcher = (props: ControllerDispatcherProps) => {
  return (
    <Switch>
      {/* No game started yet - show generic waiting state */}
      <Match when={!props.gameInProgress || !props.gameId}>
        <WaitingState latency={props.latency} />
      </Match>

      {/* Tug of War */}
      <Match when={props.gameId === 'tug-of-war'}>
        <TugOfWarController 
          onInput={props.onInput} 
          latency={props.latency}
          team={props.team}
        />
      </Match>

      {/* Rope Racers */}
      <Match when={props.gameId === 'rope-racers'}>
        <RopeRacersController 
          onInput={props.onInput} 
          latency={props.latency}
          gameState={props.gameState}
          gameEvents={props.gameEvents}
          playerId={props.playerId || ''}
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
