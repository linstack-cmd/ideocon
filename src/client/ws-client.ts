import type { ClientMessage, ServerMessage } from '../shared/types.js';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Array<(msg: ServerMessage) => void> = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private latency = 0;
  private latencyHandlers: Array<(latency: number) => void> = [];
  private pendingPings = new Map<string, number>();
  private pingInterval: number | null = null;

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          
          // Handle pong messages for latency measurement
          if (message.type === 'pong') {
            const sentTime = this.pendingPings.get(message.id);
            if (sentTime !== undefined) {
              const latency = Date.now() - sentTime;
              this.latency = latency;
              this.latencyHandlers.forEach((handler) => handler(latency));
              this.pendingPings.delete(message.id);
            }
          }
          
          this.messageHandlers.forEach((handler) => handler(message));
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.stopPingInterval();
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    } catch (err) {
      console.error('Error connecting to WebSocket:', err);
      this.attemptReconnect();
    }
  }

  private startPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
    }
    this.pingInterval = window.setInterval(() => {
      this.sendPing();
    }, 3000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendPing(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const id = `ping-${Date.now()}-${Math.random()}`;
      const timestamp = Date.now();
      this.pendingPings.set(id, timestamp);
      this.send({
        type: 'ping',
        id,
        timestamp,
      });
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onLatency(handler: (latency: number) => void): void {
    this.latencyHandlers.push(handler);
  }

  getLatency(): number {
    return this.latency;
  }

  disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
