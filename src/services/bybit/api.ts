import type {
  BybitApiResponse,
  BybitCategory,
  BybitInterval,
  BybitKline,
  BybitTicker,
  BybitOrderbook,
  BybitInstrument,
  CandleData,
  TickerData,
} from "./types";

const BASE_URL = "https://api.bybit.com";

// Map frontend timeframe to Bybit interval
export const timeframeToInterval: Record<string, BybitInterval> = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};

async function fetchBybit<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const start = Date.now();
  const res = await fetch(url.toString());
  const latency = Date.now() - start;

  if (!res.ok) {
    throw new Error(`Bybit API error: ${res.status} ${res.statusText}`);
  }

  const data: BybitApiResponse<T> = await res.json();

  if (data.retCode !== 0) {
    throw new Error(`Bybit API: ${data.retMsg} (code ${data.retCode})`);
  }

  // Store latency for status indicator
  window.__bybitLatency = latency;

  return data.result;
}

// Augment window for latency tracking
declare global {
  interface Window {
    __bybitLatency?: number;
  }
}

// ─── Klines / Candles ───────────────────────────────────────────────
export async function getKlines(
  symbol: string,
  interval: string,
  category: BybitCategory = "linear",
  limit = 200
): Promise<CandleData[]> {
  const bybitInterval = timeframeToInterval[interval] || interval;

  const result = await fetchBybit<{ list: string[][] }>("/v5/market/kline", {
    category,
    symbol,
    interval: bybitInterval,
    limit: String(limit),
  });

  // Bybit returns newest first, we need oldest first for charts
  return result.list
    .map((k) => ({
      time: Math.floor(Number(k[0]) / 1000), // ms to seconds
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }))
    .reverse();
}

// ─── Tickers ────────────────────────────────────────────────────────
export async function getTickers(
  category: BybitCategory = "linear",
  symbol?: string
): Promise<TickerData[]> {
  const params: Record<string, string> = { category };
  if (symbol) params.symbol = symbol;

  const result = await fetchBybit<{ list: BybitTicker[] }>("/v5/market/tickers", params);

  return result.list.map((t) => {
    const bid = Number(t.bid1Price);
    const ask = Number(t.ask1Price);
    const mid = (bid + ask) / 2;
    return {
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      change24h: Number(t.price24hPcnt) * 100,
      high24h: Number(t.highPrice24h),
      low24h: Number(t.lowPrice24h),
      volume24h: t.volume24h,
      turnover24h: t.turnover24h,
      bid,
      bidSize: Number(t.bid1Size),
      ask,
      askSize: Number(t.ask1Size),
      spread: mid > 0 ? ((ask - bid) / mid) * 100 : 0,
      openInterest: t.openInterest || "0",
      fundingRate: t.fundingRate || "0",
      nextFundingTime: Number(t.nextFundingTime || 0),
    };
  });
}

// ─── Orderbook ──────────────────────────────────────────────────────
export async function getOrderbook(
  symbol: string,
  category: BybitCategory = "linear",
  limit = 25
) {
  const result = await fetchBybit<BybitOrderbook>("/v5/market/orderbook", {
    category,
    symbol,
    limit: String(limit),
  });

  return {
    bids: result.b.map(([price, size]) => ({ price: Number(price), size: Number(size) })),
    asks: result.a.map(([price, size]) => ({ price: Number(price), size: Number(size) })),
    timestamp: result.ts,
  };
}

// ─── Open Interest ──────────────────────────────────────────────────
export async function getOpenInterest(
  symbol: string,
  intervalTime: "5min" | "15min" | "30min" | "1h" | "4h" | "1d" = "5min",
  category: BybitCategory = "linear",
  limit = 50
) {
  const result = await fetchBybit<{ list: Array<{ openInterest: string; timestamp: string }> }>(
    "/v5/market/open-interest",
    { category, symbol, intervalTime, limit: String(limit) }
  );

  return result.list.map((item) => ({
    openInterest: Number(item.openInterest),
    timestamp: Number(item.timestamp),
  }));
}

// ─── Funding Rate ───────────────────────────────────────────────────
export async function getFundingHistory(
  symbol: string,
  category: BybitCategory = "linear",
  limit = 20
) {
  const result = await fetchBybit<{
    list: Array<{ symbol: string; fundingRate: string; fundingRateTimestamp: string }>;
  }>("/v5/market/funding/history", { category, symbol, limit: String(limit) });

  return result.list.map((item) => ({
    fundingRate: Number(item.fundingRate),
    timestamp: Number(item.fundingRateTimestamp),
  }));
}

// ─── Instruments Info ───────────────────────────────────────────────
export async function getInstruments(category: BybitCategory = "linear") {
  const result = await fetchBybit<{ list: BybitInstrument[] }>("/v5/market/instruments-info", {
    category,
  });
  return result.list.filter((i) => i.status === "Trading");
}
