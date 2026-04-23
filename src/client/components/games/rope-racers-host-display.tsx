// Rope Racers host display - runs physics simulation and renders the race

import { createSignal, createEffect, For, onCleanup, onMount } from 'solid-js';

interface RopeRacersHostDisplayProps {
  gameState: any;
  gameEvents: any[];
  onClearEvents?: () => void;
  players: any[];
  onBroadcastState?: (state: any) => void;
  onPlayAgain?: () => void;
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
  anchorId: number | null;
  angle: number; // angle of swing in radians
  angularVelocity: number;
  ropeLength: number; // per-player rope length (set at grab time)
  eliminated: boolean;
}

interface AnchorPoint {
  x: number;
  y: number;
  id: number;
}

const GRAVITY = 0.25;
const ROPE_LENGTH = 80;
const ANCHOR_GRAB_RADIUS = 350; // Increased to make grabbing more reliably reachable
const GROUND_LEVEL = 600;
const ANCHOR_MIN_Y = 150; // Anchors spawn with room for swing arc clearance
const ANCHOR_MAX_Y = 280; // Anchors spawn with room for swing arc clearance
const ELIMINATION_Y = 900; // Players eliminated if they fall below this (safety net)
const FLOOR_Y = GROUND_LEVEL;
const ANCHOR_SPAWN_AHEAD = 1500; // Spawn anchors this far ahead of camera
const ANCHOR_CLEANUP_BEHIND = 500; // Clean up anchors this far behind camera
const INITIAL_ANCHOR_DISTANCE = 200; // Distance from start to first anchor (easier grab)

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

  // Generate anchors dynamically - ensure continuous anchor coverage
  const generateAnchorsInRange = (minX: number, maxX: number, existingAnchors: AnchorPoint[]): AnchorPoint[] => {
    const anchors = [...existingAnchors];
    let nextId = Math.max(0, ...anchors.map(a => a.id)) + 1;
    
    // Find the rightmost anchor
    const rightmostX = anchors.length > 0 ? Math.max(...anchors.map(a => a.x)) : -500;
    
    // Generate anchors from rightmostX to maxX if needed
    if (rightmostX < maxX) {
      let currentX = rightmostX > 0 ? rightmostX : INITIAL_ANCHOR_DISTANCE;
      let lastY = anchors.length > 0 ? anchors[anchors.length - 1].y : 215;
      
      while (currentX < maxX) {
        const minGap = 150;
        const maxGap = 350;
        const gapDistance = minGap + Math.random() * (maxGap - minGap);
        
        currentX += gapDistance;
        
        if (currentX >= maxX) break;
        
        // Vary height with some noise but keep anchors lower and closer to ground
        const heightVariation = (Math.random() - 0.5) * 100;
        const y = Math.max(ANCHOR_MIN_Y, Math.min(ANCHOR_MAX_Y, lastY + heightVariation));
        
        anchors.push({ x: currentX, y, id: nextId });
        lastY = y;
        nextId++;
      }
    }
    
    // Remove anchors that are too far behind
    return anchors.filter(a => a.x >= minX);
  };

  // Find the best anchor for a player to grab (extracted for reuse)
  const findBestAnchorForPlayer = (player: PlayerState, anchors: AnchorPoint[]): AnchorPoint | null => {
    let bestAnchor: AnchorPoint | null = null;
    let bestScore = Infinity;

    anchors.forEach((anchor: AnchorPoint) => {
      // Anchor must be ahead (positive x direction)
      if (anchor.x < player.position) return;

      const dx = anchor.x - player.position;
      const dy = anchor.y - player.y; // Negative if anchor is above, positive if below
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Must be within grab radius
      if (dist >= ANCHOR_GRAB_RADIUS) return;

      // Scoring function: heavily weight height advantage (how far above the player the anchor is)
      // Height advantage is -dy (negative dy means anchor is above, which is good)
      const heightAdvantage = -dy; // Positive value when anchor is above player
      
      // Horizontal distance penalty - we want anchors that aren't too far ahead
      const horizontalPenalty = dx;
      
      // Score prioritizes height advantage with a high weight factor
      // If anchor is above, height advantage is large and positive, reducing overall score
      // If anchor is below/same level, height advantage is small/negative, increasing score
      // The weight factor (3.0) makes height advantage 3x more important than horizontal distance
      const score = horizontalPenalty - heightAdvantage * 3.0;

      if (score < bestScore) {
        bestScore = score;
        bestAnchor = anchor;
      }
    });

    return bestAnchor;
  };

  // Initialize game
  onMount(() => {
    // Generate initial anchors
    const anchors = generateAnchorsInRange(0, ANCHOR_SPAWN_AHEAD, []);
    setAnchorPoints(anchors);
    
    // Initialize player states - players start flying, not hanging
    const states = new Map<string, PlayerState>();
    props.players.forEach((player) => {
      // All players start flying at the left edge with velocity toward first anchor
      states.set(player.id, {
        id: player.id,
        name: player.name || `Player ${player.id.substring(0, 4)}`,
        position: 0,
        velocity: 5,
        y: 200,
        vyy: 0,
        state: 'flying',
        grabbing: false,
        anchorId: null,
        angle: 0,
        angularVelocity: 0,
        ropeLength: ROPE_LENGTH,
        eliminated: false,
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
      // Only process events and physics if game has started
      if (gameStarted()) {
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
                const bestAnchor = findBestAnchorForPlayer(player, anchors);

                if (bestAnchor !== null && bestAnchor !== undefined) {
                  // Transition to swinging
                  const selectedAnchor: AnchorPoint = bestAnchor;
                  const dx = player.position - selectedAnchor.x;
                  const dy = player.y - selectedAnchor.y;
                  const actualDistance = Math.sqrt(dx * dx + dy * dy);
                  
                  // Calculate initial angle
                  const initialAngle = Math.atan2(dx, dy);
                  
                  // Project current velocity onto tangent of swing
                  const tangentX = Math.cos(initialAngle);
                  const tangentY = -Math.sin(initialAngle);
                  const projectedVel = player.velocity * tangentX + player.vyy * tangentY;
                  
                  player.state = 'swinging';
                  player.grabbing = true;
                  player.anchorId = selectedAnchor.id;
                  player.angle = initialAngle;
                  player.ropeLength = actualDistance; // FIX 1: Set rope length to actual distance to prevent teleport
                  player.angularVelocity = projectedVel / actualDistance;
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
          const anchors = anchorPoints();

          newStates.forEach((player) => {
            if (player.eliminated) return;

            if (player.state === 'flying') {
              // Apply gravity
              player.vyy += GRAVITY;
              player.y += player.vyy;
              player.position += player.velocity;

              // FIX 2: Ground collision eliminates the player
              if (player.y >= FLOOR_Y) {
                player.eliminated = true;
              }

              // Check if fell off the screen - elimination (safety net)
              if (player.y >= ELIMINATION_Y) {
                player.eliminated = true;
              }
            } else if (player.state === 'swinging') {
              const anchor = anchors.find((a: AnchorPoint) => a.id === player.anchorId);
              if (!anchor) {
                player.state = 'flying';
                return;
              }

              // Simple pendulum physics with damping
              const g = GRAVITY;
              const ropeLen = player.ropeLength; // FIX 1: Use per-player rope length instead of constant

              // Angular acceleration from gravity
              const angularAccel = -(g / ropeLen) * Math.sin(player.angle);
              player.angularVelocity += angularAccel;
              
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

              // Ground check - eliminate if swinging through ground (can happen with long ropes)
              if (player.y >= FLOOR_Y) {
                player.eliminated = true;
              }

              // If released, transition to flying
              if (player.grabbing === false && player.anchorId !== null) {
                player.state = 'flying';
                // Calculate tangent velocity from angular velocity
                const tangentVel = player.angularVelocity * ropeLen;
                player.velocity = Math.cos(player.angle) * tangentVel;
                player.vyy = -Math.sin(player.angle) * tangentVel;
              }
            }
          });

          return newStates;
        });

        // Check winner condition after physics update
        if (winner() === null && gameStarted()) {
          const states = playerStates();
          const alivePlayers = Array.from(states.values()).filter(p => !p.eliminated);
          const hasAnyElimination = alivePlayers.length < props.players.length;

          if (props.players.length === 1) {
            // Single-player: game ends when the sole player is eliminated
            if (alivePlayers.length === 0) {
              setWinner('Game Over!');
            }
          } else {
            // Multiplayer: game ends when only 1 player remains alive AND at least one elimination has occurred
            if (alivePlayers.length === 1 && hasAnyElimination) {
              setWinner(`${alivePlayers[0].name} Wins!`);
            } else if (alivePlayers.length === 0) {
              setWinner('No Players Left!');
            }
          }
        }

        // Update anchors dynamically based on camera position
        setCameraX((cam) => {
          const newAnchors = generateAnchorsInRange(
            cam - ANCHOR_CLEANUP_BEHIND,
            cam + ANCHOR_SPAWN_AHEAD,
            anchorPoints()
          );
          setAnchorPoints(newAnchors);
          return cam;
        });
      }

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
        anchorId: p.anchorId,
        eliminated: p.eliminated,
        grabbing: p.grabbing,
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

    // Calculate camera position (follow the leader among alive players)
    let maxX: number = 0;
    states.forEach((player) => {
      if (!player.eliminated && player.position > maxX) maxX = player.position;
    });

    const targetCameraX = Math.max(0, maxX - canvas.width * 0.3);
    const smoothCamera = cameraX() + (targetCameraX - cameraX()) * 0.1;
    setCameraX(smoothCamera);

    const cam = smoothCamera;

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

      // Draw rope if swinging (only for alive players)
      if (!player.eliminated && player.state === 'swinging' && player.anchorId !== null) {
        const anchor = anchors.find((a: AnchorPoint) => a.id === player.anchorId);
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

      // Draw nearest-anchor indicator (only for alive players in flying state)
      if (!player.eliminated && player.state === 'flying') {
        const nextAnchor = findBestAnchorForPlayer(player, anchors);
        if (nextAnchor) {
          const anchorScreenX = nextAnchor.x - cam;
          // Draw a circle around the nearest reachable anchor
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(anchorScreenX, nextAnchor.y, 15, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }
      }

      // Draw player character
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
      ctx.fillStyle = player.eliminated ? '#666666' : colors[playerIdx % colors.length];
      playerIdx++;
      ctx.beginPath();
      ctx.arc(screenX, player.y, 12, 0, Math.PI * 2);
      ctx.fill();

      // Draw player name
      ctx.fillStyle = player.eliminated ? '#999999' : '#000000';
      ctx.font = `${player.eliminated ? 'italic' : 'bold'} 12px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText((player.name || 'Unknown').substring(0, 10), screenX, player.y - 20);

      // Draw position indicator (only for alive players)
      if (!player.eliminated) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.fillText(`${Math.round(player.position as number)}m`, screenX, player.y + 25);
      }
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
      ctx.fillText(winner()!, canvas.width / 2, canvas.height / 2 - 40);

      ctx.font = 'bold 20px Arial';
      ctx.fillText('(Press Play Again button below)', canvas.width / 2, canvas.height / 2 + 30);
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

      <div style="position: relative; width: 100%; height: calc(100% - 120px);">
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

      {winner() && (
        <button
          onClick={() => props.onPlayAgain?.()}
          style={{
            padding: '0.75rem 2rem',
            'font-size': '1.1rem',
            'font-weight': 'bold',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            'border-radius': '4px',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#45a049')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#4CAF50')}
        >
          Play Again
        </button>
      )}
    </div>
  );
};
