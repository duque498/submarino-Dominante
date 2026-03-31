import type { CandleData, ConnectionStatus } from "./types";

type WSCallback = (data: any) => void;

const WS_URLS: Record<string, string> = {
  linear: "wss://stream.bybit.com/v5/public/linear",
  spot: "wss://stream.bybit.com/v5/public/spot",
};

export class BybitWebSocket {
  private ws: WebSocket | null = null;
  private category: string;
  private subscriptions = new Map<string, WSCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private statusCallbacks = new Set<(status: ConnectionStatus) => void>();

  constructor(category: string = "linear") {
    this.category = category;
  }

  private getStatus(connected: boolean, error: string | null = null): ConnectionStatus {
    return {
      connected,
      lastSync: connected ? Date.now() : null,
      latency: window.__bybitLatency ?? null,
      error,
    };
  }

  onStatusChange(cb: (status: ConnectionStatus) => void) {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private notifyStatus(connected: boolean, error: string | null = null) {
    const status = this.getStatus(connected, error);
    this.statusCallbacks.forEach((cb) => cb(status));
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = WS_URLS[this.category] || WS_URLS.linear;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`[Bybit WS] Connected to ${this.category}`);
      this.reconnectAttempts = 0;
      this.notifyStatus(true);

      // Re-subscribe to all topics
      this.subscriptions.forEach((_, topic) => {
        this.sendSubscribe(topic);
      });

      // Heartbeat
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: "ping" }));
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Ignore pong
        if (msg.op === "pong" || msg.ret_msg === "pong") return;

        // Handle subscription confirmations
        if (msg.op === "subscribe") return;

        // Route data to callback
        if (msg.topic) {
          const cb = this.subscriptions.get(msg.topic);
          if (cb) cb(msg.data);
        }
      } catch {
        // skip non-JSON
      }
    };

    this.ws.onclose = () => {
      console.log("[Bybit WS] Disconnected");
      this.notifyStatus(false);
      this.cleanup();
      this.attemptReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[Bybit WS] Error:", err);
      this.notifyStatus(false, "Erro de conexão WebSocket");
    };
  }

  private sendSubscribe(topic: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: "subscribe", args: [topic] }));
    }
  }

  subscribe(topic: string, callback: WSCallback) {
    this.subscriptions.set(topic, callback);
    this.sendSubscribe(topic);
  }

  unsubscribe(topic: string) {
    this.subscriptions.delete(topic);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: "unsubscribe", args: [topic] }));
    }
  }

  // Convenience: subscribe to kline updates
  subscribeKline(symbol: string, interval: string, callback: (candle: CandleData) => void) {
    const topic = `kline.${interval}.${symbol}`;
    this.subscribe(topic, (data) => {
      if (Array.isArray(data)) {
        data.forEach((k: any) => {
          callback({
            time: Math.floor(Number(k.start) / 1000),
            open: Number(k.open),
            high: Number(k.high),
            low: Number(k.low),
            close: Number(k.close),
            volume: Number(k.volume),
          });
        });
      }
    });
    return topic;
  }

  // Convenience: subscribe to ticker updates
  subscribeTicker(symbol: string, callback: (ticker: any) => void) {
    const topic = `tickers.${symbol}`;
    this.subscribe(topic, callback);
    return topic;
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyStatus(false, "Máximo de tentativas de reconexão atingido");
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[Bybit WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanup() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.maxReconnectAttempts = 0; // prevent reconnect
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
    this.notifyStatus(false);
  }
}

// Singleton instances
let linearWS: BybitWebSocket | null = null;
let spotWS: BybitWebSocket | null = null;

export function getBybitWS(category: string = "linear"): BybitWebSocket {
  if (category === "spot") {
    if (!spotWS) {
      spotWS = new BybitWebSocket("spot");
      spotWS.connect();
    }
    return spotWS;
  }
  if (!linearWS) {
    linearWS = new BybitWebSocket("linear");
    linearWS.connect();
  }
  return linearWS;
}
