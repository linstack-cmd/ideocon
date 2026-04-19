import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RoomManager } from './room-manager.js';
import { WebSocketHandler } from './ws-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const roomManager = new RoomManager();

// Setup Vite dev middleware in development
if (process.env.NODE_ENV !== 'production') {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } catch (err) {
    console.warn('Vite dev server not available, falling back to static files');
  }
}

// Serve static client files (for production or fallback)
const clientPath = join(__dirname, '../client');
app.use(express.static(clientPath));

// WebSocket connection handler
wss.on('connection', (ws) => {
  const handler = new WebSocketHandler(ws, roomManager);
  handler.init();
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(join(clientPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Ideocon server running on http://localhost:${PORT}`);
});
