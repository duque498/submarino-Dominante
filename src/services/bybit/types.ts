// Bybit v5 API types

export interface BybitKline {
  startTime: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  turnover: string;
}

export interface BybitTicker {
  symbol: string;
  lastPrice: string;
  indexPrice: string;
  markPrice: string;
  prevPrice24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  turnover24h: string;
  volume24h: string;
  bid1Price: string;
  bid1Size: string;
  ask1Price: string;
  ask1Size: string;
  openInterest: string;
  openInterestValue: string;
  fundingRate: string;
  nextFundingTime: string;
}

export interface BybitOrderbookEntry {
  price: string;
  size: string;
}

export interface BybitOrderbook {
  s: string; // symbol
  b: [string, string][]; // bids [price, size]
  a: [string, string][]; // asks [price, size]
  ts: number;
  u: number;
}

export interface BybitInstrument {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  contractType?: string;
  launchTime: string;
  priceScale: string;
  leverageFilter?: {
    minLeverage: string;
    maxLeverage: string;
  };
  lotSizeFilter: {
    maxOrderQty: string;
    minOrderQty: string;
    qtyStep: string;
  };
}

export interface BybitApiResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

export type BybitCategory = "spot" | "linear" | "inverse";
export type BybitInterval = "1" | "3" | "5" | "15" | "30" | "60" | "120" | "240" | "360" | "720" | "D" | "W" | "M";

// Mapped types for frontend use
export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerData {
  symbol: string;
  lastPrice: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: string;
  turnover24h: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  spread: number;
  openInterest: string;
  fundingRate: string;
  nextFundingTime: number;
}

export interface ConnectionStatus {
  connected: boolean;
  lastSync: number | null;
  latency: number | null;
  error: string | null;
}
