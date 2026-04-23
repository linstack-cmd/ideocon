// Rope Racers host display - runs physics simulation and renders the race

import { createSignal, createEffect, For, onCleanup, onMount } from 'solid-js';

interface RopeRacersHostDisplayProps {
  gameState: any;
  gameEvents: any[];
  onClearEvents?: () => void;
  players: any[];
  onBroadcastState?: (state: any) => void;
}

interface GameEvent {
  action: 'grab' | 'release';
  playerId: string;
  timestamp: number;
}

interface PlayerState {
  id: string;
  name?: string;
  position: number;
  velocity: number; // horizontal velocity
  y: number; // vertical position
  vyy: number; // vertical velocity
  state: 'flying' | 'swinging';
  grabbing: boolean;
  anchorIndex: number | null;
  angle: number; // angle of swing in radians
  angularVelocity: number;
  finished: boolean;
}

interface AnchorPoint {
  x: number;
  y: number;
  id: number;
}

const GRAVITY = 0.6;
const ROPE_LENGTH = 80;
const ANCHOR_GRAB_RADIUS = 100;
const TRACK_WIDTH = 8000;
const TRACK_HEIGHT = 800;
const GROUND_LEVEL = 600;
const FINISH_LINE_X = TRACK_WIDTH - 200;
const BOUNCE_DAMPING = 0.4;
const FLOOR_Y = GROUND_LEVEL;
const PENDULUM_DAMPING = 0.98; // Apply each tick to angular velocity
const GROUND_RUN_SPEED = 3.5; // Forward speed when grounded and running

export const RopeRacersHostDisplay = (props: RopeRacersHostDisplayProps) => {
  const [gameStarted, setGameStarted] = createSignal(false);
  const [countdownTime, setCountdownTime] = createSignal(3);
  const [winner, setWinner] = createSignal<string | null>(null);
  const [playerStates, setPlayerStates] = createSignal<Map<string, PlayerState>>(new Map());
  const [anchorPoints, setAnchorPoints] = createSignal<AnchorPoint[]>([]);
  const [cameraX, setCameraX] = createSignal(0);
  let canvasRef: HTMLCanvasElement | undefined;
  let gameLoopId: number | null = null;
  let broadcastIntervalId: number | null = null;
  let countdownIntervalId: number | null = null;

  // Generate anchor points along the track
  const generateAnchors = () => {
    const anchors: AnchorPoint[] = [];
    let id = 0;
    
    // Stagger anchor heights for interesting swinging
    let currentX = 400;
    let lastY = 300;
    
    while (currentX < TRACK_WIDTH) {
      const minGap = 150;
      const maxGap = 350;
      const gapDistance = minGap + Math.random() * (maxGap - minGap);
      
      currentX += gapDistance;
      
      if (currentX >= TRACK_WIDTH) break;
      
      // Vary height with some noise
      const heightVariation = (Math.random() - 0.5) * 200;
      const y = Math.max(150, Math.min(450, lastY + heightVariation));
      
      anchors.push({ x: currentX, y, id });
      lastY = y;
      id++;
    }
    
    return anchors;
  };

  // Initialize game
  onMount(() => {
    const anchors = generateAnchors();
    setAnchorPoints(anchors);
    
    // Initialize player states
    const states = new Map<string, PlayerState>();
    props.players.forEach((player) => {
      states.set(player.id, {
        id: player.id,
        name: player.name || `Player ${player.id.substring(0, 4)}`,
        position: 0,
        velocity: 0,
        y: GROUND_LEVEL,
        vyy: 0,
        state: 'flying',
        grabbing: false,
        anchorIndex: null,
        angle: 0,
        angularVelocity: 0,
        finished: false,
      });
    });
    setPlayerStates(states);
    
    // Start countdown
    let countdown = 3;
    setCountdownTime(countdown);
    countdownIntervalId = window.setInterval(() => {
      countdown--;
      setCountdownTime(countdown);
      if (countdown <= 0) {
        if (countdownIntervalId !== null) {
          clearInterval(countdownIntervalId);
        }
        setGameStarted(true);
      }
    }, 1000);

    // Game loop - runs physics and rendering together
    const tick = () => {
      // Process any queued events from the game events signal
      const pendingEvents = props.gameEvents;
      if (pendingEvents.length > 0) {
        setPlayerStates((prevStates) => {
          const newStates = new Map(prevStates);
          const anchors = anchorPoints();
          
          // Process each event
          pendingEvents.forEach((event) => {
            const player = newStates.get(event.playerId);
            if (!player) return;
            
            if (event.action === 'grab' && player.state === 'flying') {
              // Find nearest anchor ahead of the player
              let bestAnchor: AnchorPoint | null = null;
              let bestDistance = Infinity;

              anchors.forEach((anchor: AnchorPoint) => {
                // Anchor must be ahead (positive x direction)
                if (anchor.x < player.position) return;

                const dx = anchor.x - player.position;
                const dy = anchor.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < ANCHOR_GRAB_RADIUS && dist < bestDistance) {
                  bestDistance = dist;
                  bestAnchor = anchor;
                }
              });

              if (bestAnchor !== null && bestAnchor !== undefined) {
                // Transition to swinging
                const selectedAnchor: AnchorPoint = bestAnchor;
                const anchorIdx = anchors.findIndex((a: AnchorPoint) => a.id === selectedAnchor.id);
                const dx = selectedAnchor.x - player.position;
                const dy = selectedAnchor.y - player.y;
                
                // Calculate initial angle
                const initialAngle = Math.atan2(dx, dy);
                
                // Project current velocity onto tangent of swing
                const tangentX = -Math.sin(initialAngle);
                const tangentY = Math.cos(initialAngle);
                const projectedVel = player.velocity * tangentX + player.vyy * tangentY;
                
                player.state = 'swinging';
                player.grabbing = true;
                player.anchorIndex = anchorIdx;
                player.angle = initialAngle;
                player.angularVelocity = projectedVel / ROPE_LENGTH;
              }
            } else if (event.action === 'release' && player.state === 'swinging') {
              // Release rope
              player.grabbing = false;
            }
          });
          
          return newStates;
        });
        
        // Clear the processed events
        if (props.onClearEvents) {
          props.onClearEvents();
        }
      }

      // Update physics
      setPlayerStates((prevStates) => {
        const newStates = new Map(prevStates);
        const finished = winner() !== null;

        newStates.forEach((player) => {
          if (player.finished || finished) return;

          const anchors = anchorPoints();

          if (player.state === 'flying') {
            // Apply gravity
            player.vyy += GRAVITY;
            player.y += player.vyy;
            player.position += player.velocity;

            // Ground collision
            if (player.y >= FLOOR_Y) {
              player.y = FLOOR_Y;
              player.vyy = 0;
              player.velocity *= (1 - BOUNCE_DAMPING);
              
              // Auto-run forward when on ground (allows reaching first anchor)
              if (player.velocity < GROUND_RUN_SPEED) {
                player.velocity = GROUND_RUN_SPEED;
              }
            }

            // Check if falling too much
            if (player.y > TRACK_HEIGHT) {
              player.y = FLOOR_Y;
              player.velocity *= 0.5;
              player.vyy = 0;
            }
          } else if (player.state === 'swinging') {
            const anchor = anchors[player.anchorIndex!];
            if (!anchor) {
              player.state = 'flying';
              return;
            }

            // Simple pendulum physics with damping
            const g = GRAVITY;
            const ropeLen = ROPE_LENGTH;

            // Angular acceleration from gravity
            const angularAccel = -(g / ropeLen) * Math.sin(player.angle);
            player.angularVelocity += angularAccel;
            
            // Apply pendulum damping to prevent energy growth
            player.angularVelocity *= PENDULUM_DAMPING;
            
            player.angle += player.angularVelocity;

            // Clamp angle to prevent wrapping
            if (Math.abs(player.angle) > Math.PI * 0.9) {
              player.angularVelocity *= 0.9;
              if (Math.abs(player.angle) > Math.PI) {
                player.angle = Math.sign(player.angle) * Math.PI;
              }
            }

            // Update position from pendulum
            player.y = anchor.y + ropeLen * Math.cos(player.angle);
            player.position = anchor.x + ropeLen * Math.sin(player.angle);

            // If released, transition to flying
            if (player.grabbing === false && player.anchorIndex !== null) {
              player.state = 'flying';
              // Calculate tangent velocity from angular velocity
              const tangentVel = player.angularVelocity * ropeLen;
              player.velocity = Math.cos(player.angle) * tangentVel;
              player.vyy = -Math.sin(player.angle) * tangentVel;
            }
          }

          // Check for finish line
          if (player.position >= FINISH_LINE_X && !player.finished) {
            player.finished = true;
            if (!winner()) {
              setWinner(`${player.name} Wins!`);
            }
          }
        });

        return newStates;
      });

      // Render to canvas
      if (canvasRef) {
        renderFrame();
      }

      gameLoopId = requestAnimationFrame(tick);
    };

    // Start game loop immediately
    gameLoopId = requestAnimationFrame(tick);

    // Broadcast state at lower frequency
    broadcastIntervalId = window.setInterval(() => {
      const states = playerStates();
      const anchors = anchorPoints();
      const playersData = Array.from(states.values()).map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        y: p.y,
        state: p.state,
        anchorIndex: p.anchorIndex,
        finished: p.finished,
      }));

      if (props.onBroadcastState) {
        props.onBroadcastState({
          players: playersData,
          anchors: anchors.map((a: AnchorPoint) => ({ x: a.x, y: a.y })),
          winner: winner(),
          gameStarted: gameStarted(),
        });
      }
    }, 50); // 20fps broadcast
  });



  // Render frame - called from within the game loop
  const renderFrame = () => {
    const canvas = canvasRef;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const states = playerStates();
    const anchors = anchorPoints();

    // Clear canvas
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw ground
    ctx.fillStyle = '#34A853';
    ctx.fillRect(0, canvas.height - 100, canvas.width, 100);

    // Calculate camera position (follow the leader)
    let maxX: number = 0;
    states.forEach((player) => {
      if (player.position > maxX) maxX = player.position;
    });

    const targetCameraX = Math.max(0, maxX - canvas.width * 0.3);
    const smoothCamera = cameraX() + (targetCameraX - cameraX()) * 0.1;
    setCameraX(smoothCamera);

    const cam = smoothCamera;

    // Draw finish line
    const finishScreenX = FINISH_LINE_X - cam;
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(finishScreenX, 0);
    ctx.lineTo(finishScreenX, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('FINISH', finishScreenX - 35, 30);

    // Draw anchor points
    ctx.fillStyle = '#8B4513';
    anchors.forEach((anchor: AnchorPoint) => {
      const screenX = anchor.x - cam;
      if (screenX < -50 || screenX > canvas.width + 50) return;

      ctx.beginPath();
      ctx.arc(screenX, anchor.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw players and ropes
    let playerIdx = 0;
    states.forEach((player) => {
      const screenX = player.position - cam;

      // Draw rope if swinging
      if (player.state === 'swinging' && player.anchorIndex !== null) {
        const anchor = anchors[player.anchorIndex];
        if (anchor) {
          const anchorScreenX = anchor.x - cam;
          ctx.strokeStyle = '#DAA520';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(anchorScreenX, anchor.y);
          ctx.lineTo(screenX, player.y);
          ctx.stroke();
        }
      }

      // Draw player character
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      ctx.fillStyle = colors[playerIdx % colors.length];
      playerIdx++;
      ctx.beginPath();
      ctx.arc(screenX, player.y, 12, 0, Math.PI * 2);
      ctx.fill();

      // Draw player name
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText((player.name || 'Unknown').substring(0, 10), screenX, player.y - 20);

      // Draw position indicator
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px Arial';
      ctx.fillText(`${Math.round(player.position as number)}m`, screenX, player.y + 25);
    });

    // Draw UI
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'left';

    if (!gameStarted()) {
      const countdown = countdownTime();
      ctx.font = 'bold 80px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(countdown > 0 ? countdown.toString() : 'GO!', canvas.width / 2, canvas.height / 2);
    }

    if (winner()) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(winner()!, canvas.width / 2, canvas.height / 2);
    }
  };

  onCleanup(() => {
    if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
    if (broadcastIntervalId !== null) clearInterval(broadcastIntervalId);
    if (countdownIntervalId !== null) clearInterval(countdownIntervalId);
  });

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; padding: 1rem; background: #1a1a1a;">
      <h1 style="color: white; margin: 0;">Rope Racers</h1>

      <div style="position: relative; width: 100%; height: calc(100% - 60px);">
        <canvas
          ref={canvasRef}
          width={1200}
          height={700}
          style={{
            border: '2px solid white',
            'background-color': '#87CEEB',
            'display': 'block',
            'width': '100%',
            'height': '100%',
            'max-width': '1200px',
            'margin': '0 auto',
          }}
        />
      </div>

      <div style="color: white; font-size: 0.9rem; text-align: center;">
        Players: {playerStates().size}
      </div>
    </div>
  );
};
