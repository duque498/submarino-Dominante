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
  category: "trend" | "momentum" | "volume" | "volatility" | "structure" | "derivatives";
  params: IndicatorParam[];
  outputs: string[];
}

const SOURCE_OPTIONS = [
  { label: "Close", value: "close" },
  { label: "Open", value: "open" },
  { label: "High", value: "high" },
  { label: "Low", value: "low" },
  { label: "HL2", value: "hl2" },
  { label: "HLC3", value: "hlc3" },
];

export const INDICATOR_CATALOG: IndicatorDef[] = [
  // ──── Trend ────
  {
    type: "ema",
    label: "EMA",
    description: "Média Móvel Exponencial",
    category: "trend",
    params: [
      { name: "period", label: "Período", type: "number", default: 21, min: 2, max: 500, step: 1 },
      { name: "source", label: "Fonte", type: "select", default: "close", options: SOURCE_OPTIONS },
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
      { name: "source", label: "Fonte", type: "select", default: "close", options: SOURCE_OPTIONS },
    ],
    outputs: ["value"],
  },
  {
    type: "adx",
    label: "ADX",
    description: "Average Directional Index (Força da Tendência)",
    category: "trend",
    params: [
      { name: "period", label: "Período", type: "number", default: 14, min: 2, max: 100, step: 1 },
    ],
    outputs: ["adx", "plus_di", "minus_di"],
  },
  {
    type: "supertrend",
    label: "Supertrend",
    description: "Indicador de tendência com ATR",
    category: "trend",
    params: [
      { name: "period", label: "Período ATR", type: "number", default: 10, min: 2, max: 100, step: 1 },
      { name: "multiplier", label: "Multiplicador", type: "number", default: 3, min: 0.5, max: 10, step: 0.5 },
    ],
    outputs: ["value", "direction"],
  },
  {
    type: "price_vs_ma",
    label: "Preço vs Média",
    description: "Relação do preço com uma média móvel",
    category: "trend",
    params: [
      { name: "ma_type", label: "Tipo MA", type: "select", default: "ema", options: [
        { label: "EMA", value: "ema" }, { label: "SMA", value: "sma" },
      ]},
      { name: "period", label: "Período", type: "number", default: 21, min: 2, max: 500, step: 1 },
    ],
    outputs: ["above", "distance_pct"],
  },

  // ──── Momentum ────
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
    type: "stochastic",
    label: "Stochastic",
    description: "Oscilador Estocástico (%K, %D)",
    category: "momentum",
    params: [
      { name: "k_period", label: "%K Período", type: "number", default: 14, min: 2, max: 100 },
      { name: "d_period", label: "%D Período", type: "number", default: 3, min: 1, max: 50 },
      { name: "slowing", label: "Slowing", type: "number", default: 3, min: 1, max: 10 },
    ],
    outputs: ["k", "d"],
  },
  {
    type: "pct_change",
    label: "Variação %",
    description: "Variação percentual em N candles",
    category: "momentum",
    params: [
      { name: "period", label: "Candles", type: "number", default: 1, min: 1, max: 100, step: 1 },
      { name: "source", label: "Fonte", type: "select", default: "close", options: SOURCE_OPTIONS },
    ],
    outputs: ["value"],
  },

  // ──── Volume ────
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
    type: "obv",
    label: "OBV",
    description: "On Balance Volume",
    category: "volume",
    params: [],
    outputs: ["value"],
  },

  // ──── Volatility ────
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
    type: "volatility_pct",
    label: "Volatilidade %",
    description: "ATR como percentual do preço",
    category: "volatility",
    params: [
      { name: "period", label: "Período ATR", type: "number", default: 14, min: 2, max: 100 },
    ],
    outputs: ["value"],
  },
  {
    type: "spread",
    label: "Spread",
    description: "Diferença bid/ask como percentual",
    category: "volatility",
    params: [],
    outputs: ["value"],
  },

  // ──── Structure ────
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
  {
    type: "price_breakout",
    label: "Rompimento",
    description: "Detecta rompimento de máxima/mínima anterior",
    category: "structure",
    params: [
      { name: "lookback", label: "Lookback", type: "number", default: 20, min: 2, max: 200, step: 1 },
      { name: "direction", label: "Direção", type: "select", default: "high", options: [
        { label: "Alta (Máxima)", value: "high" },
        { label: "Baixa (Mínima)", value: "low" },
      ]},
    ],
    outputs: ["breakout", "level"],
  },

  // ──── Derivatives ────
  {
    type: "open_interest",
    label: "Open Interest",
    description: "Contratos em aberto (Perpétuo)",
    category: "derivatives",
    params: [
      { name: "change_period", label: "Período variação", type: "number", default: 1, min: 1, max: 100 },
    ],
    outputs: ["value", "change_pct"],
  },
  {
    type: "funding_rate",
    label: "Funding Rate",
    description: "Taxa de financiamento (Perpétuo)",
    category: "derivatives",
    params: [],
    outputs: ["value"],
  },
];

export const INDICATOR_CATEGORIES = [
  { key: "trend", label: "Tendência", icon: "TrendingUp" },
  { key: "momentum", label: "Momentum", icon: "Zap" },
  { key: "volume", label: "Volume", icon: "BarChart3" },
  { key: "volatility", label: "Volatilidade", icon: "Activity" },
  { key: "structure", label: "Estrutura", icon: "Layers" },
  { key: "derivatives", label: "Derivativos", icon: "Landmark" },
] as const;

export function getIndicatorDef(type: string): IndicatorDef | undefined {
  return INDICATOR_CATALOG.find((i) => i.type === type);
}

export function getDefaultParams(type: string): Record<string, number | string> {
  const def = getIndicatorDef(type);
  if (!def) return {};
  return Object.fromEntries(def.params.map((p) => [p.name, p.default]));
}

// Operators available for conditions
export const CONDITION_OPERATORS = [
  { value: ">", label: "Maior que" },
  { value: "<", label: "Menor que" },
  { value: ">=", label: "Maior ou igual" },
  { value: "<=", label: "Menor ou igual" },
  { value: "==", label: "Igual a" },
  { value: "crosses_above", label: "Cruza acima" },
  { value: "crosses_below", label: "Cruza abaixo" },
  { value: "between", label: "Entre" },
  { value: "increasing", label: "Subindo" },
  { value: "decreasing", label: "Descendo" },
] as const;
