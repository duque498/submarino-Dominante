// Indicator definitions for the strategy engine

export interface IndicatorParam {
  name: string;
  label: string;
  type: "number" | "select";
  default: number | string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface IndicatorDef {
  type: string;
  label: string;
  description: string;
  category: "trend" | "momentum" | "volume" | "volatility" | "structure";
  params: IndicatorParam[];
  outputs: string[];
}

export const INDICATOR_CATALOG: IndicatorDef[] = [
  {
    type: "ema",
    label: "EMA",
    description: "Média Móvel Exponencial",
    category: "trend",
    params: [
      { name: "period", label: "Período", type: "number", default: 21, min: 2, max: 500, step: 1 },
      { name: "source", label: "Fonte", type: "select", default: "close", options: [
        { label: "Close", value: "close" }, { label: "Open", value: "open" },
        { label: "High", value: "high" }, { label: "Low", value: "low" },
        { label: "HL2", value: "hl2" }, { label: "HLC3", value: "hlc3" },
      ]},
    ],
    outputs: ["value"],
  },
  {
    type: "sma",
    label: "SMA",
    description: "Média Móvel Simples",
    category: "trend",
    params: [
      { name: "period", label: "Período", type: "number", default: 50, min: 2, max: 500, step: 1 },
      { name: "source", label: "Fonte", type: "select", default: "close", options: [
        { label: "Close", value: "close" }, { label: "Open", value: "open" },
        { label: "High", value: "high" }, { label: "Low", value: "low" },
      ]},
    ],
    outputs: ["value"],
  },
  {
    type: "rsi",
    label: "RSI",
    description: "Índice de Força Relativa",
    category: "momentum",
    params: [
      { name: "period", label: "Período", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    outputs: ["value"],
  },
  {
    type: "macd",
    label: "MACD",
    description: "Convergência/Divergência de Médias",
    category: "momentum",
    params: [
      { name: "fast", label: "Rápida", type: "number", default: 12, min: 2, max: 100 },
      { name: "slow", label: "Lenta", type: "number", default: 26, min: 2, max: 200 },
      { name: "signal", label: "Sinal", type: "number", default: 9, min: 2, max: 50 },
    ],
    outputs: ["macd", "signal", "histogram"],
  },
  {
    type: "bbands",
    label: "Bollinger Bands",
    description: "Bandas de Bollinger",
    category: "volatility",
    params: [
      { name: "period", label: "Período", type: "number", default: 20, min: 5, max: 200 },
      { name: "stddev", label: "Desvio Padrão", type: "number", default: 2, min: 0.5, max: 5, step: 0.5 },
    ],
    outputs: ["upper", "middle", "lower", "width"],
  },
  {
    type: "atr",
    label: "ATR",
    description: "Average True Range (Volatilidade)",
    category: "volatility",
    params: [
      { name: "period", label: "Período", type: "number", default: 14, min: 2, max: 100 },
    ],
    outputs: ["value"],
  },
  {
    type: "volume_sma",
    label: "Volume SMA",
    description: "Média de Volume",
    category: "volume",
    params: [
      { name: "period", label: "Período", type: "number", default: 20, min: 2, max: 200 },
    ],
    outputs: ["value", "ratio"],
  },
  {
    type: "vwap",
    label: "VWAP",
    description: "Volume Weighted Average Price",
    category: "volume",
    params: [],
    outputs: ["value"],
  },
  {
    type: "stoch_rsi",
    label: "Stochastic RSI",
    description: "RSI Estocástico",
    category: "momentum",
    params: [
      { name: "rsi_period", label: "RSI Período", type: "number", default: 14, min: 2, max: 100 },
      { name: "stoch_period", label: "Stoch Período", type: "number", default: 14, min: 2, max: 100 },
      { name: "k_smooth", label: "K Smooth", type: "number", default: 3, min: 1, max: 10 },
      { name: "d_smooth", label: "D Smooth", type: "number", default: 3, min: 1, max: 10 },
    ],
    outputs: ["k", "d"],
  },
  {
    type: "support_resistance",
    label: "Suporte/Resistência",
    description: "Níveis de S/R baseados em pivots",
    category: "structure",
    params: [
      { name: "lookback", label: "Lookback", type: "number", default: 50, min: 10, max: 500 },
      { name: "strength", label: "Força mínima", type: "number", default: 3, min: 1, max: 10 },
    ],
    outputs: ["nearest_support", "nearest_resistance"],
  },
];

export const INDICATOR_CATEGORIES = [
  { key: "trend", label: "Tendência", icon: "TrendingUp" },
  { key: "momentum", label: "Momentum", icon: "Zap" },
  { key: "volume", label: "Volume", icon: "BarChart3" },
  { key: "volatility", label: "Volatilidade", icon: "Activity" },
  { key: "structure", label: "Estrutura", icon: "Layers" },
] as const;

export function getIndicatorDef(type: string): IndicatorDef | undefined {
  return INDICATOR_CATALOG.find((i) => i.type === type);
}

export function getDefaultParams(type: string): Record<string, number | string> {
  const def = getIndicatorDef(type);
  if (!def) return {};
  return Object.fromEntries(def.params.map((p) => [p.name, p.default]));
}
