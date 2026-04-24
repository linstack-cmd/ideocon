// Rope Racers host display - runs physics simulation and renders the race

import { createSignal, createEffect, For, onCleanup, onMount } from 'solid-js';

// Asset loading and caching
interface LoadedAssets {
  backgroundLayers: HTMLImageElement[];
  sprites: {
    idle: HTMLImageElement;
    jump: HTMLImageElement;
    fall: HTMLImageElement;
    dead: HTMLImageElement;
  };
  loaded: boolean;
}

// Per-player sprite cache with tinted versions
interface TintedSpriteCache {
  [color: string]: {
    idle: OffscreenCanvas | null;
    jump: OffscreenCanvas | null;
    fall: OffscreenCanvas | null;
    dead: OffscreenCanvas | null;
  };
}

// Utility: convert hex color to RGB
const hexToRGB = (hex: string): { r: number; g: number; b: number } => {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return { r, g, b };
};

// Utility: get luminance of a color
const getLuminance = (r: number, g: number, b: number): number => {
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

// Utility: tint a sprite image with a color using luminance-based blending
const tintSpriteImage = (
  img: HTMLImageElement,
  hexColor: string
): OffscreenCanvas => {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Get pixel data
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;

  // Get target color
  const targetRGB = hexToRGB(hexColor);

  // Apply luminance-based tint per pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip fully transparent pixels
    if (a === 0) continue;

    // Get grayscale value (luminance)
    const gray = getLuminance(r, g, b);

    // Normalize gray to 0-1 range
    const normalized = gray / 255;

    // Apply tint: multiply normalized grayscale by target color
    data[i] = Math.round(targetRGB.r * normalized);
    data[i + 1] = Math.round(targetRGB.g * normalized);
    data[i + 2] = Math.round(targetRGB.b * normalized);
    // Keep alpha unchanged
  }

  // Put tinted data back
  ctx.putImageData(imageData, 0, 0);

  return canvas;
};

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
  color?: string; // unique player color
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

interface Obstacle {
  x: number; // center x
  y: number; // center y
  width: number; // 5-15px (very narrow stick)
  height: number; // 80-200px (tall stick)
  angle: number; // rotation angle in radians
  id: number;
}

const GRAVITY = 0.25;
const ROPE_LENGTH = 80;
const INITIAL_ANCHOR_DISTANCE = 200; // Distance from start to first anchor (easier grab)
const PLAYER_RADIUS = 12;
const OBSTACLE_MIN_WIDTH = 5;   // Very narrow stick
const OBSTACLE_MAX_WIDTH = 15;  // Very narrow stick
const OBSTACLE_MIN_HEIGHT = 80; // Tall stick
const OBSTACLE_MAX_HEIGHT = 200; // Tall stick
const ANCHOR_CLEANUP_BEHIND = 500; // Clean up anchors this far behind camera
const OBSTACLE_CLEANUP_BEHIND = 500; // Same as anchors
const CAMERA_ELIMINATION_GRACE_BUFFER = 80; // Pixels beyond left edge before elimination
const OBSTACLE_GROUND_MARGIN = 50; // Margin between obstacle bottom and floor

export const RopeRacersHostDisplay = (props: RopeRacersHostDisplayProps) => {
  const [gameStarted, setGameStarted] = createSignal(false);
  const [countdownTime, setCountdownTime] = createSignal(3);
  const [winner, setWinner] = createSignal<string | null>(null);
  const [playerStates, setPlayerStates] = createSignal<Map<string, PlayerState>>(new Map());
  const [anchorPoints, setAnchorPoints] = createSignal<AnchorPoint[]>([]);
  const [obstacles, setObstacles] = createSignal<Obstacle[]>([]);
  const [cameraX, setCameraX] = createSignal(0);
  const [canvasWidth, setCanvasWidth] = createSignal(1200);
  const [canvasHeight, setCanvasHeight] = createSignal(700);
  const [assetsLoaded, setAssetsLoaded] = createSignal(false);

  // Asset and sprite caching
  let assets: LoadedAssets = {
    backgroundLayers: [],
    sprites: {
      idle: new Image(),
      jump: new Image(),
      fall: new Image(),
      dead: new Image(),
    },
    loaded: false,
  };

  let tintedSpriteCache: TintedSpriteCache = {};

  // Animation state per player
  interface PlayerAnimationState {
    currentFrame: number;
    tickCounter: number;
    previousAnimName: keyof typeof SPRITE_FRAMES | null;
  }
  let playerAnimationStates: Map<string, PlayerAnimationState> = new Map();

  // Frame counts per animation
  const SPRITE_FRAMES = {
    idle: 11,
    jump: 1,
    fall: 1,
    dead: 4,
  };

  const FRAME_ADVANCE_TICKS = 6; // Advance animation every 6 ticks (~10fps animation)
  const SPRITE_FRAME_WIDTH = 34; // Each frame is 34px wide
  const SPRITE_FRAME_HEIGHT = 28; // Height is 28px
  const SPRITE_SCALE = 3; // Scale up 3x for visibility
  
  // Compute dynamic physics constants from canvas dimensions
  const getFloorY = () => canvasHeight();
  const getAnchorMinY = () => Math.round(canvasHeight() * 0.21); // ~150 at 700px
  const getAnchorMaxY = () => Math.round(canvasHeight() * 0.40); // ~280 at 700px
  const getObstacleMinY = () => Math.round(canvasHeight() * 0.46); // ~320 at 700px
  const getObstacleMaxY = () => getFloorY() - OBSTACLE_GROUND_MARGIN - OBSTACLE_MAX_HEIGHT; // Stay above floor with margin
  const getEliminationY = () => canvasHeight() * 1.3; // ~910 at 700px
  const getAnchorSpawnAhead = () => Math.max(1500, canvasWidth());
  const getObstacleSpawnAhead = () => Math.max(1500, canvasWidth());
  
  let canvasRef: HTMLCanvasElement | undefined;
  let gameLoopId: number | null = null;
  let broadcastIntervalId: number | null = null;
  let countdownIntervalId: number | null = null;
  let resizeHandler: (() => void) | null = null;

  // Generate anchors dynamically - ensure continuous anchor coverage
  const generateAnchorsInRange = (minX: number, maxX: number, existingAnchors: AnchorPoint[]): AnchorPoint[] => {
    const anchors = [...existingAnchors];
    let nextId = Math.max(0, ...anchors.map(a => a.id)) + 1;
    
    const ANCHOR_MIN_Y = getAnchorMinY();
    const ANCHOR_MAX_Y = getAnchorMaxY();
    
    // Find the rightmost anchor
    const rightmostX = anchors.length > 0 ? Math.max(...anchors.map(a => a.x)) : -500;
    
    // Generate anchors from rightmostX to maxX if needed
    if (rightmostX < maxX) {
      let currentX = rightmostX > 0 ? rightmostX : INITIAL_ANCHOR_DISTANCE;
      let lastY = anchors.length > 0 ? anchors[anchors.length - 1].y : getAnchorMinY() + (getAnchorMaxY() - getAnchorMinY()) / 2;
      
      while (currentX < maxX) {
        const minGap = 150;
        const maxGap = 350;
        const gapDistance = minGap + Math.random() * (maxGap - minGap);
        
        currentX += gapDistance;
        
        if (currentX >= maxX) break;
        
        // Vary height with some noise but keep anchors in valid range
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

  // Generate obstacles dynamically
  const generateObstaclesInRange = (minX: number, maxX: number, existingObstacles: Obstacle[], anchorPoints: AnchorPoint[]): Obstacle[] => {
    const obstacles = [...existingObstacles];
    let nextId = Math.max(0, ...obstacles.map(o => o.id), ...anchorPoints.map(a => a.id)) + 1;
    
    const OBSTACLE_MIN_Y = getObstacleMinY();
    const OBSTACLE_MAX_Y = getObstacleMaxY();
    const FLOOR_Y = getFloorY();
    
    // Find the rightmost obstacle
    const rightmostX = obstacles.length > 0 ? Math.max(...obstacles.map(o => o.x)) : -500;
    
    // Generate obstacles from rightmostX to maxX if needed (roughly one per 2-3 anchor gaps)
    if (rightmostX < maxX) {
      let currentX = rightmostX > 0 ? rightmostX : 400;
      
      while (currentX < maxX) {
        const minGap = 400;
        const maxGap = 600;
        const gapDistance = minGap + Math.random() * (maxGap - minGap);
        
        currentX += gapDistance;
        
        if (currentX >= maxX) break;
        
        // Random obstacle size - narrow sticks
        const width = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
        const height = OBSTACLE_MIN_HEIGHT + Math.random() * (OBSTACLE_MAX_HEIGHT - OBSTACLE_MIN_HEIGHT);
        
        // Random y position in playable space, ensuring center is in valid range
        // Account for rotated bounds: max extent from center is sqrt(width^2 + height^2)/2
        const maxExtent = Math.sqrt(width * width + height * height) / 2;
        const maxY = Math.min(OBSTACLE_MAX_Y, FLOOR_Y - OBSTACLE_GROUND_MARGIN - maxExtent);
        const minY = Math.max(OBSTACLE_MIN_Y, maxExtent);
        const y = minY + Math.random() * Math.max(0, maxY - minY);
        
        // Random rotation angle (full 360 degrees)
        const angle = Math.random() * Math.PI * 2;
        
        // Check if this obstacle overlaps with any anchors (avoid placing on top of anchors)
        const overlapsAnchor = anchorPoints.some(a => Math.abs(a.x - currentX) < 120);
        
        // Only add if obstacle center is in valid space
        if (!overlapsAnchor) {
          obstacles.push({ x: currentX, y, width, height, angle, id: nextId });
          nextId++;
        }
      }
    }
    
    // Remove obstacles that are too far behind
    return obstacles.filter(o => o.x >= minX);
  };

  // Check collision between player circle and rotated obstacle rectangle
  const checkObstacleCollision = (player: PlayerState, obstacle: Obstacle): { collides: boolean; normal: { x: number; y: number }; distance: number } => {
    // Transform player position into obstacle's local space (rotate backwards)
    const cos = Math.cos(-obstacle.angle);
    const sin = Math.sin(-obstacle.angle);
    const dx = player.position - obstacle.x;
    const dy = player.y - obstacle.y;
    
    // Rotate player position into local space
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    
    // AABB collision in local space - find closest point on rectangle to circle center
    // Rectangle is centered at origin with width and height
    const halfWidth = obstacle.width / 2;
    const halfHeight = obstacle.height / 2;
    
    const closestLocalX = Math.max(-halfWidth, Math.min(localX, halfWidth));
    const closestLocalY = Math.max(-halfHeight, Math.min(localY, halfHeight));
    
    // Distance from circle center to closest point
    const distLocalX = localX - closestLocalX;
    const distLocalY = localY - closestLocalY;
    const distance = Math.sqrt(distLocalX * distLocalX + distLocalY * distLocalY);
    
    if (distance < PLAYER_RADIUS) {
      // Collision detected! Calculate normal in local space
      let normalLocalX = distLocalX;
      let normalLocalY = distLocalY;
      
      if (distance > 0) {
        normalLocalX /= distance;
        normalLocalY /= distance;
      } else {
        // Default normal if exactly at closest point
        normalLocalX = 1;
        normalLocalY = 0;
      }
      
      // Transform normal back to world space
      const normalWorldX = normalLocalX * cos + normalLocalY * sin;
      const normalWorldY = -normalLocalX * sin + normalLocalY * cos;
      
      return { collides: true, normal: { x: normalWorldX, y: normalWorldY }, distance };
    }
    
    return { collides: false, normal: { x: 0, y: 0 }, distance };
  };

  // Continuous collision detection for flying state - dynamic substeps sized to PLAYER_RADIUS
  const checkSweptCollision = (startX: number, startY: number, endX: number, endY: number, obstacle: Obstacle): { collision: boolean; t: number; normal: { x: number; y: number }; distance: number } => {
    const dx = endX - startX;
    const dy = endY - startY;
    const displacement = Math.sqrt(dx * dx + dy * dy);
    
    if (displacement < 0.001) {
      // No movement, use simple collision check
      const collision = checkObstacleCollision({ position: startX, y: startY } as PlayerState, obstacle);
      return { collision: collision.collides, t: 0, normal: collision.normal, distance: collision.distance };
    }
    
    // Calculate number of substeps based on displacement and PLAYER_RADIUS
    const numSteps = Math.ceil(displacement / PLAYER_RADIUS);
    
    // Check at each substep from t=0 to t=1
    for (let i = 0; i <= numSteps; i++) {
      const t = i / numSteps;
      const checkX = startX + dx * t;
      const checkY = startY + dy * t;
      
      const collision = checkObstacleCollision({ position: checkX, y: checkY } as PlayerState, obstacle);
      if (collision.collides) {
        return { collision: true, t, normal: collision.normal, distance: collision.distance };
      }
    }
    
    return { collision: false, t: 1, normal: { x: 0, y: 0 }, distance: PLAYER_RADIUS };
  };

  // Apply bounce collision physics - reflect velocity perpendicular to surface
  const applyBounce = (player: PlayerState, normal: { x: number; y: number }, distance: number) => {
    // Reflect velocity across the surface normal
    // v_reflected = v - 2(v · n)n
    const dotProduct = player.velocity * normal.x + player.vyy * normal.y;
    player.velocity -= 2 * dotProduct * normal.x;
    player.vyy -= 2 * dotProduct * normal.y;
    
    // Push player fully outside obstacle (separate by full penetration depth)
    // Penetration is how far the player center has penetrated the PLAYER_RADIUS boundary
    const penetration = PLAYER_RADIUS - distance;
    if (penetration > 0) {
      player.position += normal.x * penetration;
      player.y += normal.y * penetration;
    }
  };

  // Find the best anchor for a player to grab (two-pass algorithm with safety filter)
  const findBestAnchorForPlayer = (player: PlayerState, anchors: AnchorPoint[]): AnchorPoint | null => {
    const IDEAL_FORWARD_DISTANCE = 250; // Midpoint of anchor gap range (150-350px)
    const FLOOR_Y = getFloorY();
    
    // Helper: check if an anchor is safe to swing from (won't crash into ground)
    const isSafeAnchor = (anchor: AnchorPoint, playerPos: PlayerState): boolean => {
      const dx = anchor.x - playerPos.position;
      const dy = anchor.y - playerPos.y;
      const ropeLength = Math.sqrt(dx * dx + dy * dy);
      // Anchor is unsafe if the bottom of the swing arc would hit the ground
      return anchor.y + ropeLength <= FLOOR_Y;
    };
    
    // Helper: score a forward anchor by proximity to ideal forward distance
    const scoreForwardAnchor = (anchor: AnchorPoint, playerPos: PlayerState): number => {
      const horizontalDist = anchor.x - playerPos.position;
      // Score: absolute deviation from ideal forward distance (lower is better)
      return Math.abs(horizontalDist - IDEAL_FORWARD_DISTANCE);
    };
    
    // Pass 1: Find safe forward anchors (ahead of player, safe to swing from)
    const forwardCandidates: AnchorPoint[] = [];
    
    anchors.forEach((anchor: AnchorPoint) => {
      // Must be ahead of the player
      if (anchor.x <= player.position) return;
      
      // Must be safe (won't crash into ground)
      if (!isSafeAnchor(anchor, player)) return;
      
      forwardCandidates.push(anchor);
    });
    
    // If we found safe forward anchors, pick the one closest to ideal forward distance
    if (forwardCandidates.length > 0) {
      let bestAnchor = forwardCandidates[0];
      let bestScore = scoreForwardAnchor(bestAnchor, player);
      
      for (let i = 1; i < forwardCandidates.length; i++) {
        const score = scoreForwardAnchor(forwardCandidates[i], player);
        if (score < bestScore) {
          bestScore = score;
          bestAnchor = forwardCandidates[i];
        }
      }
      
      return bestAnchor;
    }
    
    // Pass 2 (fallback): if no safe forward anchor exists, look for safe behind-player anchors
    const behindCandidates: AnchorPoint[] = [];
    
    anchors.forEach((anchor: AnchorPoint) => {
      // Must be behind the player
      if (anchor.x >= player.position) return;
      
      // Must be safe
      if (!isSafeAnchor(anchor, player)) return;
      
      behindCandidates.push(anchor);
    });
    
    // If any safe behind-player anchors exist, return the closest one
    if (behindCandidates.length > 0) {
      let bestAnchor = behindCandidates[0];
      let bestDist = Math.sqrt(
        Math.pow(bestAnchor.x - player.position, 2) + 
        Math.pow(bestAnchor.y - player.y, 2)
      );
      
      for (let i = 1; i < behindCandidates.length; i++) {
        const dist = Math.sqrt(
          Math.pow(behindCandidates[i].x - player.position, 2) + 
          Math.pow(behindCandidates[i].y - player.y, 2)
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestAnchor = behindCandidates[i];
        }
      }
      
      return bestAnchor;
    }
    
    // No safe anchor found
    return null;
  };

  // Load assets
  const loadAssets = async () => {
    try {
      // Load background layers
      const layerPromises = [];
      for (let i = 1; i <= 7; i++) {
        const img = new Image();
        img.src = `/backgrounds/layer-${i}.png`;
        layerPromises.push(
          new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Failed to load layer-${i}.png`));
          })
        );
        assets.backgroundLayers.push(img);
      }

      // Load sprite sheets
      const spritePromises: Promise<void>[] = [];

      ['idle', 'jump', 'fall', 'dead'].forEach((name: string) => {
        const img = new Image();
        img.src = `/sprites/${name}.png`;
        assets.sprites[name as keyof typeof assets.sprites] = img;
        spritePromises.push(
          new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error(`Failed to load ${name}.png`));
          })
        );
      });

      // Wait for all assets
      await Promise.all([...layerPromises, ...spritePromises]);
      assets.loaded = true;
      setAssetsLoaded(true);
    } catch (err) {
      console.error('Failed to load game assets:', err);
    }
  };

  // Initialize game
  onMount(() => {
    // Load assets first
    loadAssets();

    // Handle canvas resize
    resizeHandler = () => {
      if (canvasRef) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        setCanvasWidth(width);
        setCanvasHeight(height);
        // Update canvas resolution to match window
        canvasRef.width = width;
        canvasRef.height = height;
      }
    };

    // Set initial size
    resizeHandler();
    
    // Add resize listener
    window.addEventListener('resize', resizeHandler);

    // Generate initial anchors
    const anchors = generateAnchorsInRange(0, getAnchorSpawnAhead(), []);
    setAnchorPoints(anchors);
    
    // Generate initial obstacles
    const obs = generateObstaclesInRange(0, getObstacleSpawnAhead(), [], anchors);
    setObstacles(obs);
    
    // Initialize player states - players start flying, not hanging
    const states = new Map<string, PlayerState>();
    const initialPlayerY = Math.round(canvasHeight() * 0.286); // 200px at 700px canvas height, scales with canvas
    props.players.forEach((player) => {
      // All players start flying at the left edge with velocity toward first anchor
      states.set(player.id, {
        id: player.id,
        name: player.name || `Player ${player.id.substring(0, 4)}`,
        color: player.color,
        position: 0,
        velocity: 5,
        y: initialPlayerY,
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

    // Capture elimination results to avoid signal re-read issues
    let lastAlivePlayers: PlayerState[] = [];

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
                  
                  // Energy-preserving grab: convert full kinetic energy to rotational energy
                  // Calculate full speed (magnitude of velocity vector)
                  const speed = Math.sqrt(player.velocity * player.velocity + player.vyy * player.vyy);
                  
                  // Get the sign of rotation from the tangential component
                  const tangentX = Math.cos(initialAngle);
                  const tangentY = -Math.sin(initialAngle);
                  const tangentialComponent = player.velocity * tangentX + player.vyy * tangentY;
                  
                  // Determine sign: use tangential component sign, fall back to horizontal velocity if tangential is negligible
                  let sign = Math.sign(tangentialComponent);
                  if (Math.abs(tangentialComponent) < 0.01) {
                    sign = Math.sign(player.velocity);
                  }
                  
                  // Energy-preserving conversion: ω = sign * speed / R
                  player.state = 'swinging';
                  player.grabbing = true;
                  player.anchorId = selectedAnchor.id;
                  player.angle = initialAngle;
                  player.ropeLength = actualDistance; // FIX 1: Set rope length to actual distance to prevent teleport
                  player.angularVelocity = sign * speed / actualDistance;
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
          const obstacleList = obstacles();
          
          const FLOOR_Y = getFloorY();
          const ELIMINATION_Y = getEliminationY();

          newStates.forEach((player) => {
            if (player.eliminated) return;

            if (player.state === 'flying') {
              // Store old position for CCD
              const oldX = player.position;
              const oldY = player.y;
              
              // Apply gravity
              player.vyy += GRAVITY;
              const newY = oldY + player.vyy;
              const newX = oldX + player.velocity;

              // Check obstacle collisions with CCD and bounce
              let collided = false;
              let earliestT = 1;
              let collisionNormal = { x: 0, y: 0 };
              let collisionDistance = PLAYER_RADIUS;
              
              obstacleList.forEach((obstacle) => {
                const swept = checkSweptCollision(oldX, oldY, newX, newY, obstacle);
                if (swept.collision && swept.t < earliestT) {
                  earliestT = swept.t;
                  collisionNormal = swept.normal;
                  collisionDistance = swept.distance;
                  collided = true;
                }
              });
              
              if (collided) {
                // Move to collision point
                player.position = oldX + player.velocity * earliestT;
                player.y = oldY + player.vyy * earliestT;
                
                // Apply bounce with actual collision distance for proper penetration
                applyBounce(player, collisionNormal, collisionDistance);
              } else {
                // No collision, use full movement
                player.y = newY;
                player.position = newX;
              }

              // Ground collision eliminates the player
              if (player.y >= FLOOR_Y) {
                player.eliminated = true;
              }

              // Check if fell off the screen - elimination (safety net)
              if (player.y >= ELIMINATION_Y) {
                player.eliminated = true;
              }

              // Check camera-based elimination - players behind camera left edge get eliminated
              const cameraLeftEdge = cameraX() - CAMERA_ELIMINATION_GRACE_BUFFER;
              if (player.position < cameraLeftEdge) {
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
              const ropeLen = player.ropeLength; // Use per-player rope length

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

              // Check if swinging player hits obstacle - bounce while staying attached to rope
              // This must run before the ground check so obstacle bounce can save the player
              let hitObstacle = false;
              obstacleList.forEach((obstacle) => {
                const collision = checkObstacleCollision(player, obstacle);
                if (collision.collides && !hitObstacle) {
                  hitObstacle = true;
                  
                  // Stay on rope - apply bounce as angular velocity impulse
                  // Calculate current velocity from angular velocity
                  const tangentVel = player.angularVelocity * ropeLen;
                  const oldVelocity = { x: Math.cos(player.angle) * tangentVel, y: -Math.sin(player.angle) * tangentVel };
                  
                  // Apply bounce reflection to velocity (temporary velocity for impulse calculation)
                  const normal = collision.normal;
                  const dotProduct = oldVelocity.x * normal.x + oldVelocity.y * normal.y;
                  const newVelocity = {
                    x: oldVelocity.x - 2 * dotProduct * normal.x,
                    y: oldVelocity.y - 2 * dotProduct * normal.y,
                  };
                  
                  // Calculate velocity delta
                  const deltaVel = {
                    x: newVelocity.x - oldVelocity.x,
                    y: newVelocity.y - oldVelocity.y,
                  };
                  
                  // Project delta velocity onto tangent direction
                  const tangentX = Math.cos(player.angle);
                  const tangentY = -Math.sin(player.angle);
                  const deltaVelTangential = deltaVel.x * tangentX + deltaVel.y * tangentY;
                  
                  // Convert change in velocity to change in angular velocity
                  const deltaAngularVel = deltaVelTangential / ropeLen;
                  player.angularVelocity += deltaAngularVel;
                  
                  // Position correction: push player out of obstacle along normal
                  const penetration = PLAYER_RADIUS - collision.distance;
                  if (penetration > 0) {
                    const correctedX = player.position + normal.x * penetration;
                    const correctedY = player.y + normal.y * penetration;
                    
                    // Re-derive angle from corrected position relative to anchor
                    const dx = correctedX - anchor.x;
                    const dy = correctedY - anchor.y;
                    player.angle = Math.atan2(dx, dy);
                    
                    // Additional pushout: ensure position stays at least PLAYER_RADIUS from obstacle surface
                    const collision2 = checkObstacleCollision(player, obstacle);
                    if (collision2.collides) {
                      const extraPenetration = PLAYER_RADIUS - collision2.distance;
                      player.position += collision2.normal.x * extraPenetration;
                      player.y += collision2.normal.y * extraPenetration;
                      // Re-snap angle to arc
                      const dx2 = player.position - anchor.x;
                      const dy2 = player.y - anchor.y;
                      player.angle = Math.atan2(dx2, dy2);
                    }
                  }
                }
              });

              // Ground check - eliminate if y is at or below floor
              if (player.y >= FLOOR_Y) {
                player.eliminated = true;
              }

              // If released, transition to flying (always allow release, regardless of obstacle)
              if (player.grabbing === false && player.anchorId !== null) {
                player.state = 'flying';
                // Calculate tangent velocity from angular velocity
                const tangentVel = player.angularVelocity * ropeLen;
                player.velocity = Math.cos(player.angle) * tangentVel;
                player.vyy = -Math.sin(player.angle) * tangentVel;
              }
            }
          });

          // BUGFIX: Capture the alive players directly from the updated state
          // instead of re-reading the signal, which may have stale data
          lastAlivePlayers = Array.from(newStates.values()).filter(p => !p.eliminated);

          return newStates;
        });

        // Check winner condition after physics update
        // Use the locally-captured alive players instead of re-reading the signal
        if (winner() === null && gameStarted()) {
          const alivePlayers = lastAlivePlayers;
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

        // Update anchors and obstacles dynamically based on camera position
        setCameraX((cam) => {
          const newAnchors = generateAnchorsInRange(
            cam - ANCHOR_CLEANUP_BEHIND,
            cam + getAnchorSpawnAhead(),
            anchorPoints()
          );
          setAnchorPoints(newAnchors);
          
          const newObstacles = generateObstaclesInRange(
            cam - OBSTACLE_CLEANUP_BEHIND,
            cam + getObstacleSpawnAhead(),
            obstacles(),
            newAnchors
          );
          setObstacles(newObstacles);
          
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
      const obstacleList = obstacles();
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
          obstacles: obstacleList.map((o: Obstacle) => ({ x: o.x, y: o.y, width: o.width, height: o.height, angle: o.angle })),
          winner: winner(),
          gameStarted: gameStarted(),
        });
      }
    }, 50); // 20fps broadcast
  });



  // Get or create tinted sprite for a player color
  const getTintedSprite = (color: string, animName: keyof typeof SPRITE_FRAMES): OffscreenCanvas | null => {
    if (!tintedSpriteCache[color]) {
      tintedSpriteCache[color] = {
        idle: null,
        jump: null,
        fall: null,
        dead: null,
      };
    }

    if (!tintedSpriteCache[color][animName]) {
      const spriteSheet = assets.sprites[animName];
      if (!spriteSheet || !spriteSheet.complete) return null;

      try {
        tintedSpriteCache[color][animName] = tintSpriteImage(spriteSheet, color);
      } catch (err) {
        console.warn(`Failed to tint sprite ${animName} for color ${color}:`, err);
        return null;
      }
    }

    return tintedSpriteCache[color][animName];
  };

  // Draw parallax background
  const drawParallaxBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, cam: number) => {
    if (!assets.loaded || assets.backgroundLayers.length === 0) {
      // Fallback if assets not loaded
      ctx.fillStyle = '#87CEEB';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Disable image smoothing for pixel art
    ctx.imageSmoothingEnabled = false;

    // Layer dimensions (all layers are 576x324)
    const LAYER_WIDTH = 576;
    const LAYER_HEIGHT = 324;

    // Draw each layer with parallax scrolling
    assets.backgroundLayers.forEach((layer, layerIndex) => {
      if (!layer.complete) return;

      // Parallax speed: layer 1 moves slowest (~10%), layer 7 moves fastest (~95%)
      // Linear interpolation from 0.1 to 0.95
      const parallaxFactor = 0.1 + (layerIndex / (assets.backgroundLayers.length - 1)) * 0.85;
      const scrollOffset = cam * parallaxFactor;

      // Scale to fit canvas height
      const scaledWidth = (canvas.height / LAYER_HEIGHT) * LAYER_WIDTH;
      const scaledHeight = canvas.height;

      // Draw tiled layer with wrapping
      let xPos = -(scrollOffset % scaledWidth);
      while (xPos < canvas.width) {
        ctx.drawImage(layer, xPos, 0, scaledWidth, scaledHeight);
        xPos += scaledWidth;
      }
    });


  };

  // Render frame - called from within the game loop
  const renderFrame = () => {
    const canvas = canvasRef;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const states = playerStates();
    const anchors = anchorPoints();

    // Calculate camera position (follow the leader among alive players)
    let maxX: number = 0;
    states.forEach((player) => {
      if (!player.eliminated && player.position > maxX) maxX = player.position;
    });

    const targetCameraX = Math.max(0, maxX - canvas.width * 0.3);
    const smoothCamera = cameraX() + (targetCameraX - cameraX()) * 0.1;
    setCameraX(smoothCamera);

    const cam = smoothCamera;

    // Draw parallax background with computed smooth camera
    drawParallaxBackground(ctx, canvas, cam);

    // Draw anchor points
    ctx.fillStyle = '#8B4513';
    anchors.forEach((anchor: AnchorPoint) => {
      const screenX = anchor.x - cam;
      if (screenX < -50 || screenX > canvas.width + 50) return;

      ctx.beginPath();
      ctx.arc(screenX, anchor.y, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw obstacles (rotated sticks)
    const obstacleList = obstacles();
    ctx.fillStyle = '#FFD700';
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    obstacleList.forEach((obstacle: Obstacle) => {
      const screenX = obstacle.x - cam;
      
      // Cull obstacles far off-screen
      const maxExtent = Math.sqrt(obstacle.width * obstacle.width + obstacle.height * obstacle.height) / 2;
      if (screenX < -maxExtent - 50 || screenX > canvas.width + maxExtent + 50) return;

      // Save canvas state, translate to obstacle center, rotate, draw, restore
      ctx.save();
      ctx.translate(screenX, obstacle.y);
      ctx.rotate(obstacle.angle);
      
      // Draw rectangle centered at origin (obstacle is centered)
      const halfWidth = obstacle.width / 2;
      const halfHeight = obstacle.height / 2;
      ctx.fillRect(-halfWidth, -halfHeight, obstacle.width, obstacle.height);
      ctx.strokeRect(-halfWidth, -halfHeight, obstacle.width, obstacle.height);
      
      ctx.restore();
    });

    // Draw players and ropes
    states.forEach((player) => {
      const screenX = player.position - cam;

      // Draw rope if swinging (only for alive players)
      if (!player.eliminated && player.state === 'swinging' && player.anchorId !== null) {
        const anchor = anchors.find((a: AnchorPoint) => a.id === player.anchorId);
        if (anchor) {
          const anchorScreenX = anchor.x - cam;
          // Use player color for rope if available
          ctx.strokeStyle = player.color || '#DAA520';
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

      // Draw player sprite
      if (assets.loaded && player.color) {
        // Initialize animation state if needed
        if (!playerAnimationStates.has(player.id)) {
          playerAnimationStates.set(player.id, { currentFrame: 0, tickCounter: 0, previousAnimName: null });
        }

        const animState = playerAnimationStates.get(player.id)!;

        // Determine animation state and sprite
        let animName: keyof typeof SPRITE_FRAMES = 'idle';
        let shouldAnimate = true; // Flag to control frame advancement
        
        if (player.eliminated) {
          animName = 'dead';
          shouldAnimate = true;
        } else if (player.state === 'flying') {
          // When flying, use idle animation and animate it
          animName = 'idle';
          shouldAnimate = true;
        } else {
          // When swinging, use idle sprite but freeze on single frame
          animName = 'idle';
          shouldAnimate = false;
        }

        // Reset animation frame when animation changes
        if (animState.previousAnimName !== animName) {
          animState.currentFrame = 0;
          animState.tickCounter = 0;
          animState.previousAnimName = animName;
        }

        const frameCount = SPRITE_FRAMES[animName];

        // Update animation frame based on tick counter (only if this animation should animate)
        if (shouldAnimate) {
          animState.tickCounter++;
          if (animState.tickCounter >= FRAME_ADVANCE_TICKS) {
            animState.tickCounter = 0;
            animState.currentFrame++;
            // For dead animation, clamp at last frame; for others, loop
            if (animName === 'dead') {
              if (animState.currentFrame >= frameCount) {
                animState.currentFrame = frameCount - 1;
              }
            } else {
              animState.currentFrame %= frameCount;
            }
          }
        }

        // Get tinted sprite
        const tintedSprite = player.eliminated
          ? getTintedSprite('#666666', animName)
          : getTintedSprite(player.color, animName);

        if (tintedSprite) {
          // Draw sprite with frame selection
          const frameX = animState.currentFrame * SPRITE_FRAME_WIDTH;
          const scaledWidth = SPRITE_FRAME_WIDTH * SPRITE_SCALE;
          const scaledHeight = SPRITE_FRAME_HEIGHT * SPRITE_SCALE;

          // Determine facing direction based on horizontal velocity
          // During flying, use stored velocity; during swinging, compute from angular velocity
          let horizontalVel = player.velocity;
          if (player.state === 'swinging' && player.anchorId !== null) {
            const anchor = anchors.find((a: AnchorPoint) => a.id === player.anchorId);
            if (anchor) {
              const ropeLen = player.ropeLength;
              // Horizontal velocity derivative: d/dt(anchor.x + ropeLen * sin(angle)) = ropeLen * cos(angle) * angularVelocity
              horizontalVel = ropeLen * Math.cos(player.angle) * player.angularVelocity;
            }
          }
          const facingRight = horizontalVel >= 0;
          const drawX = screenX - scaledWidth / 2;
          const drawY = player.y - scaledHeight / 2;

          ctx.save();
          ctx.imageSmoothingEnabled = false;
          if (!facingRight) {
            ctx.scale(-1, 1);
            ctx.drawImage(
              tintedSprite,
              frameX,
              0,
              SPRITE_FRAME_WIDTH,
              SPRITE_FRAME_HEIGHT,
              -screenX - scaledWidth / 2,
              drawY,
              scaledWidth,
              scaledHeight
            );
          } else {
            ctx.drawImage(
              tintedSprite,
              frameX,
              0,
              SPRITE_FRAME_WIDTH,
              SPRITE_FRAME_HEIGHT,
              drawX,
              drawY,
              scaledWidth,
              scaledHeight
            );
          }
          ctx.restore();
        } else {
          // Fallback to circle if sprite not available
          ctx.fillStyle = player.eliminated ? '#666666' : (player.color || '#FF6B6B');
          ctx.beginPath();
          ctx.arc(screenX, player.y, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Draw player name
      ctx.fillStyle = player.eliminated ? '#999999' : '#000000';
      ctx.font = `${player.eliminated ? 'italic' : 'bold'} 12px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText((player.name || 'Unknown').substring(0, 10), screenX, player.y - 50);

      // Draw position indicator (only for alive players)
      if (!player.eliminated) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.fillText(`${Math.round(player.position as number)}m`, screenX, player.y + 60);
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


  };

  onCleanup(() => {
    if (gameLoopId !== null) cancelAnimationFrame(gameLoopId);
    if (broadcastIntervalId !== null) clearInterval(broadcastIntervalId);
    if (countdownIntervalId !== null) clearInterval(countdownIntervalId);
    if (resizeHandler !== null) window.removeEventListener('resize', resizeHandler);
  });

  return (
    <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; background: #000;">
      <canvas
        ref={canvasRef}
        width={canvasWidth()}
        height={canvasHeight()}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          'background-color': '#87CEEB',
        }}
      />

      {/* Winner overlay - positioned absolutely on top of canvas */}
      {winner() && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '2rem',
          'pointer-events': 'none',
          'background-color': 'rgba(0,0,0,0.5)',
        }}>
          <div style={{
            'font-size': '4rem',
            'font-weight': 'bold',
            color: '#FFFFFF',
            'text-shadow': '0 0 10px rgba(0,0,0,0.8)',
            'text-align': 'center',
          }}>
            {winner()}
          </div>
          <div style={{
            'font-size': '1.3rem',
            'font-weight': 'bold',
            color: '#FFFFFF',
            'text-shadow': '0 0 10px rgba(0,0,0,0.8)',
            'text-align': 'center',
          }}>
            (Press Play Again button below)
          </div>
        </div>
      )}

      {/* Play Again button - positioned absolutely on top of canvas */}
      {winner() && (
        <button
          onClick={() => props.onPlayAgain?.()}
          style={{
            position: 'fixed',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '1rem 2.5rem',
            'font-size': '1.3rem',
            'font-weight': 'bold',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            'border-radius': '8px',
            cursor: 'pointer',
            transition: 'background 0.2s',
            'pointer-events': 'auto',
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
