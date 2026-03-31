// Lightweight audio + browser push notification system

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** Short "tick" sound for a single condition met */
export function playConditionTick() {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

/** Multi-tone chime for entry opportunity (60%+ conditions met) */
export function playEntryAlert() {
  try {
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch {}
}

// ─── Browser Push Notifications ───

/** Check if browser notifications are supported */
export function isPushSupported(): boolean {
  return "Notification" in window;
}

/** Get current permission state */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Request notification permission from the user */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Send a browser push notification (works even when tab is not focused) */
export function sendPushNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    data?: Record<string, unknown>;
    requireInteraction?: boolean;
    onClick?: () => void;
  }
) {
  if (!isPushSupported() || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon || "/placeholder.svg",
      tag: options?.tag || `radar-${Date.now()}`,
      requireInteraction: options?.requireInteraction ?? true,
      silent: false,
    });

    if (options?.onClick) {
      notification.onclick = () => {
        window.focus();
        options.onClick?.();
        notification.close();
      };
    }

    // Auto-close after 30s if not interacted
    setTimeout(() => notification.close(), 30000);
  } catch {}
}

/** Send entry signal push notification */
export function sendEntryPushNotification(opts: {
  symbol: string;
  direction: "long" | "short";
  score: number;
  passedConditions: number;
  totalConditions: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  strategyName: string;
  onClick?: () => void;
}) {
  const dir = opts.direction === "long" ? "🟢 LONG" : "🔴 SHORT";
  const priceFmt = (n: number) => n < 1 ? n.toFixed(6) : n < 100 ? n.toFixed(4) : n.toFixed(2);

  sendPushNotification(
    `🎯 ${opts.symbol} — ${dir} (Score ${opts.score})`,
    {
      body: [
        `Entrada: $${priceFmt(opts.entryPrice)}`,
        `SL: $${priceFmt(opts.stopPrice)} | TP: $${priceFmt(opts.targetPrice)}`,
        `${opts.passedConditions}/${opts.totalConditions} condições — ${opts.strategyName}`,
      ].join("\n"),
      tag: `entry-${opts.symbol}-${Date.now()}`,
      requireInteraction: true,
      onClick: opts.onClick,
    }
  );
}

/** Send TP/SL hit push notification */
export function sendTradeResultPush(opts: {
  symbol: string;
  result: "tp" | "sl";
  pnlPercent: number;
}) {
  const isTP = opts.result === "tp";
  sendPushNotification(
    `${isTP ? "✅" : "❌"} ${opts.symbol} — ${isTP ? "TP Atingido" : "SL Atingido"}`,
    {
      body: `PnL: ${opts.pnlPercent >= 0 ? "+" : ""}${opts.pnlPercent.toFixed(2)}%`,
      tag: `result-${opts.symbol}-${Date.now()}`,
      requireInteraction: false,
    }
  );
}
