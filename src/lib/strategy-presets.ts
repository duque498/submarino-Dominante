import type { StrategyDraft } from "@/types/strategy";
import { createEmptyDraft, DEFAULT_RISK_RULES, DEFAULT_ALERT_RULES, DEFAULT_SCORE_WEIGHTS } from "@/types/strategy";

export interface StrategyPreset {
  id: string;
  label: string;
  description: string;
  profile: "conservador" | "moderado" | "agressivo";
  draft: Partial<StrategyDraft>;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    id: "scalp-conservador",
    label: "Scalp Conservador",
    description: "Scalp com filtros rigorosos, score alto e RR mínimo elevado. Poucos sinais, alta qualidade.",
    profile: "conservador",
    draft: {
      name: "Scalp Conservador",
      description: "Estratégia de scalp com critérios rigorosos de entrada",
      direction: "both",
      timeframes: ["5"],
      alertMode: "candle_close",
      scoreMin: 75,
      minRr: 2.5,
      cooldownMinutes: 60,
      maxAlertsPerSymbolPerDay: 3,
      priority: "high",
      indicators: [
        { type: "ema", label: "EMA 9", params: { period: 9 }, source: "close", timeframe: null, role: "required", weight: 15, enabled: true, plotOnChart: true },
        { type: "ema", label: "EMA 21", params: { period: 21 }, source: "close", timeframe: null, role: "required", weight: 15, enabled: true, plotOnChart: true },
        { type: "rsi", label: "RSI 14", params: { period: 14 }, source: "close", timeframe: null, role: "required", weight: 10, enabled: true, plotOnChart: false },
        { type: "volume_avg", label: "Vol Média 20", params: { period: 20 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: false },
        { type: "atr", label: "ATR 14", params: { period: 14 }, source: "close", timeframe: null, role: "informative", weight: 0, enabled: true, plotOnChart: false },
      ],
      riskRules: { ...DEFAULT_RISK_RULES, stopType: "atr", stopValue: 1.0, targets: [{ label: "TP1", rrMultiple: 2.0 }, { label: "TP2", rrMultiple: 3.0 }], maxSpreadPercent: 0.03 },
      alertRules: { ...DEFAULT_ALERT_RULES, scoreMinForAlert: 75, cooldownMinutes: 60, priority: "high" },
    },
  },
  {
    id: "swing-moderado",
    label: "Swing Moderado",
    description: "Swing trade equilibrado com confluência de indicadores e RR padrão.",
    profile: "moderado",
    draft: {
      name: "Swing Moderado",
      description: "Estratégia swing com equilíbrio entre frequência e qualidade",
      direction: "both",
      timeframes: ["15", "60"],
      alertMode: "candle_close",
      scoreMin: 60,
      minRr: 1.8,
      cooldownMinutes: 30,
      maxAlertsPerSymbolPerDay: 5,
      priority: "medium",
      indicators: [
        { type: "ema", label: "EMA 9", params: { period: 9 }, source: "close", timeframe: null, role: "required", weight: 10, enabled: true, plotOnChart: true },
        { type: "ema", label: "EMA 21", params: { period: 21 }, source: "close", timeframe: null, role: "required", weight: 10, enabled: true, plotOnChart: true },
        { type: "ema", label: "EMA 50", params: { period: 50 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: true },
        { type: "rsi", label: "RSI 14", params: { period: 14 }, source: "close", timeframe: null, role: "required", weight: 10, enabled: true, plotOnChart: false },
        { type: "macd", label: "MACD", params: { fast: 12, slow: 26, signal: 9 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: false },
        { type: "volume_avg", label: "Vol Média 20", params: { period: 20 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: false },
        { type: "adx", label: "ADX 14", params: { period: 14 }, source: "close", timeframe: null, role: "informative", weight: 0, enabled: true, plotOnChart: false },
      ],
      riskRules: { ...DEFAULT_RISK_RULES, stopType: "atr", stopValue: 1.5, targets: [{ label: "TP1", rrMultiple: 1.5 }, { label: "TP2", rrMultiple: 2.5 }] },
      alertRules: { ...DEFAULT_ALERT_RULES, scoreMinForAlert: 60, cooldownMinutes: 30, priority: "medium" },
    },
  },
  {
    id: "momentum-agressivo",
    label: "Momentum Agressivo",
    description: "Muitos sinais, score baixo, foco em velocidade. Alta frequência, mais risco.",
    profile: "agressivo",
    draft: {
      name: "Momentum Agressivo",
      description: "Estratégia agressiva de momentum com alta frequência de sinais",
      direction: "both",
      timeframes: ["1", "5"],
      alertMode: "intrabar",
      scoreMin: 45,
      minRr: 1.2,
      cooldownMinutes: 10,
      maxAlertsPerSymbolPerDay: 15,
      priority: "low",
      indicators: [
        { type: "ema", label: "EMA 5", params: { period: 5 }, source: "close", timeframe: null, role: "required", weight: 15, enabled: true, plotOnChart: true },
        { type: "ema", label: "EMA 13", params: { period: 13 }, source: "close", timeframe: null, role: "required", weight: 15, enabled: true, plotOnChart: true },
        { type: "rsi", label: "RSI 7", params: { period: 7 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: false },
        { type: "volume", label: "Volume", params: {}, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: false },
        { type: "supertrend", label: "Supertrend", params: { period: 10, multiplier: 3 }, source: "close", timeframe: null, role: "score", weight: 10, enabled: true, plotOnChart: true },
      ],
      riskRules: { ...DEFAULT_RISK_RULES, stopType: "percentage", stopValue: 0.5, targets: [{ label: "TP1", rrMultiple: 1.2 }, { label: "TP2", rrMultiple: 2.0 }], maxSpreadPercent: 0.08 },
      alertRules: { ...DEFAULT_ALERT_RULES, scoreMinForAlert: 45, cooldownMinutes: 10, priority: "low" },
    },
  },
];

export function applyPreset(preset: StrategyPreset): StrategyDraft {
  const base = createEmptyDraft();
  return {
    ...base,
    ...preset.draft,
    indicators: preset.draft.indicators || [],
    conditionGroups: base.conditionGroups,
    scoreWeights: { ...DEFAULT_SCORE_WEIGHTS },
    riskRules: preset.draft.riskRules || { ...DEFAULT_RISK_RULES },
    alertRules: preset.draft.alertRules || { ...DEFAULT_ALERT_RULES },
    tags: [preset.profile],
  };
}
