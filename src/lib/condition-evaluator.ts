/**
 * Condition Evaluator Engine
 * 
 * Parses strategy conditions from the database schema and evaluates them
 * against live market data. Fully generic — works with any strategy structure.
 */

import type { Tables } from "@/integrations/supabase/types";
import type { CandleData, TickerData } from "@/services/bybit";

// ─── Indicator Calculation ──────────────────────────────────────────

function calcSMA(data: number[], period: number): number {
  if (data.length < period) return NaN;
  const slice = data.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function calcEMA(data: number[], period: number): number {
  if (data.length < period) return NaN;
  const k = 2 / (period + 1);
  let ema = calcSMA(data.slice(0, period), period);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  const recent = closes.slice(-(period + 1));
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcATR(candles: CandleData[], period: number): number {
  if (candles.length < period + 1) return NaN;
  const trs = candles.slice(-period - 1).map((c, i, arr) => {
    if (i === 0) return 0;
    const prev = arr[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }).slice(1);
  return trs.reduce((s, v) => s + v, 0) / period;
}

// ─── Market Data Context ────────────────────────────────────────────

export interface MarketContext {
  candles: CandleData[];
  ticker: TickerData | null;
  openInterest: number | null;
  fundingRate: number | null;
}

// ─── Indicator Value Resolution ─────────────────────────────────────

export function resolveIndicatorValue(
  indType: string,
  params: Record<string, unknown> | null,
  ctx: MarketContext,
): number | null {
  if (!ctx.candles.length) return null;
  const closes = ctx.candles.map(c => c.close);
  const volumes = ctx.candles.map(c => c.volume);
  const p = params || {};

  switch (indType) {
    case "ema":
      return calcEMA(closes, Number(p.period || 21));
    case "sma":
      return calcSMA(closes, Number(p.period || 50));
    case "rsi":
      return calcRSI(closes, Number(p.period || 14));
    case "volume_sma": {
      const avg = calcSMA(volumes, Number(p.period || 20));
      const lastVol = volumes[volumes.length - 1];
      return avg > 0 ? lastVol / avg : null;
    }
    case "vwap":
      return ctx.ticker?.lastPrice ?? null;
    case "open_interest":
      return ctx.openInterest;
    case "funding_rate":
      return ctx.fundingRate != null ? ctx.fundingRate * 100 : null;
    case "atr":
      return calcATR(ctx.candles, Number(p.period || 14));
    case "spread":
      return ctx.ticker?.spread ?? null;
    case "adx":
    case "macd":
    case "bbands":
    case "stochastic":
    case "stoch_rsi":
    case "supertrend":
    case "obv":
      // These require more complex calculation — return null for now
      return null;
    default:
      return null;
  }
}

/** Get the current close price */
function getPrice(ctx: MarketContext): number | null {
  if (!ctx.candles.length) return null;
  return ctx.candles[ctx.candles.length - 1].close;
}

/** Get a previous indicator value (1 candle back) for cross detection */
function resolvePreviousIndicatorValue(
  indType: string,
  params: Record<string, unknown> | null,
  ctx: MarketContext,
): number | null {
  if (ctx.candles.length < 3) return null;
  const prevCtx: MarketContext = {
    ...ctx,
    candles: ctx.candles.slice(0, -1),
  };
  return resolveIndicatorValue(indType, params, prevCtx);
}

// ─── Condition Validation ───────────────────────────────────────────

export interface ConditionValidation {
  valid: boolean;
  error?: string;
}

export function validateCondition(
  condition: Tables<"strategy_conditions">,
  indicators: Tables<"strategy_indicators">[],
): ConditionValidation {
  // Must have an operator
  if (!condition.operator) {
    return { valid: false, error: "Operador ausente" };
  }

  // If it references an indicator, that indicator must exist
  if (condition.indicator_id) {
    const ind = indicators.find(i => i.id === condition.indicator_id);
    if (!ind) {
      return { valid: false, error: "Indicador não encontrado" };
    }
  }

  // Must have a value or compare_to
  const hasValue = condition.value !== null && condition.value !== undefined;
  const hasCompareTo = condition.compare_to !== null && condition.compare_to !== undefined;
  
  if (!hasValue && !hasCompareTo) {
    return { valid: false, error: "Comparação incompleta" };
  }

  // Check for self-comparison
  if (hasCompareTo && condition.indicator_id) {
    const compareTo = condition.compare_to as any;
    if (compareTo?.indicator_id === condition.indicator_id) {
      return { valid: false, error: "Comparação consigo mesmo" };
    }
  }

  return { valid: true };
}

// ─── Parsed Condition (human-readable + evaluatable) ────────────────

export interface ParsedCondition {
  id: string;
  label: string;           // e.g. "EMA(9) > EMA(21)"
  leftLabel: string;       // e.g. "EMA(9)"
  operator: string;        // raw operator
  operatorSymbol: string;  // display symbol like ">", "≥", "↑"
  rightLabel: string;      // e.g. "EMA(21)" or "50"
  role: string;
  weight: number;
  validation: ConditionValidation;
  // For evaluation
  leftIndicatorId: string | null;
  leftType: string;
  leftParams: Record<string, unknown> | null;
  rightType: "value" | "indicator" | "price";
  rightValue: number | null;
  rightIndicatorType: string | null;
  rightIndicatorParams: Record<string, unknown> | null;
}

const OPERATOR_SYMBOLS: Record<string, string> = {
  ">": ">",
  "<": "<",
  ">=": "≥",
  "<=": "≤",
  "==": "=",
  "crosses_above": "cruza ↑",
  "crosses_below": "cruza ↓",
  "between": "entre",
  "increasing": "subindo ↗",
  "decreasing": "caindo ↘",
};

function indicatorLabel(type: string, params: Record<string, unknown> | null): string {
  const p = params || {};
  switch (type) {
    case "ema": return `EMA(${p.period || 21})`;
    case "sma": return `SMA(${p.period || 50})`;
    case "rsi": return `RSI(${p.period || 14})`;
    case "atr": return `ATR(${p.period || 14})`;
    case "volume_sma": return `Vol/Média(${p.period || 20})`;
    case "vwap": return "VWAP";
    case "open_interest": return "OI";
    case "funding_rate": return "Funding";
    case "spread": return "Spread";
    case "macd": return `MACD(${p.fast || 12},${p.slow || 26},${p.signal || 9})`;
    case "bbands": return `BB(${p.period || 20},${p.stddev || 2})`;
    case "adx": return `ADX(${p.period || 14})`;
    case "stochastic": return `Stoch(${p.k_period || 14})`;
    case "stoch_rsi": return `StochRSI(${p.rsi_period || 14})`;
    case "supertrend": return "Supertrend";
    case "obv": return "OBV";
    default: return type.toUpperCase();
  }
}

export function parseConditions(
  conditions: Tables<"strategy_conditions">[],
  indicators: Tables<"strategy_indicators">[],
): ParsedCondition[] {
  return conditions.map(c => {
    const validation = validateCondition(c, indicators);
    const ind = c.indicator_id ? indicators.find(i => i.id === c.indicator_id) : null;
    
    // Left side
    const leftType = ind?.indicator_type || c.condition_type || "unknown";
    const leftParams = (ind?.params as Record<string, unknown>) || null;
    const leftLabel = ind ? indicatorLabel(ind.indicator_type, leftParams) : 
                      c.condition_type === "price" ? "Preço" : 
                      c.condition_type ? c.condition_type.toUpperCase() : "???";

    // Right side — can be a static value, indicator, or price
    const compareTo = c.compare_to as any;
    let rightType: "value" | "indicator" | "price" = "value";
    let rightValue: number | null = null;
    let rightIndicatorType: string | null = null;
    let rightIndicatorParams: Record<string, unknown> | null = null;
    let rightLabel = "";

    if (compareTo && typeof compareTo === "object") {
      if (compareTo.indicator_id) {
        // Comparing to another indicator
        const rightInd = indicators.find(i => i.id === compareTo.indicator_id);
        if (rightInd) {
          rightType = "indicator";
          rightIndicatorType = rightInd.indicator_type;
          rightIndicatorParams = (rightInd.params as Record<string, unknown>) || null;
          rightLabel = indicatorLabel(rightInd.indicator_type, rightIndicatorParams);
        } else {
          rightLabel = "???";
        }
      } else if (compareTo.type === "price" || compareTo.ref === "price" || compareTo.ref === "close") {
        rightType = "price";
        rightLabel = "Preço";
      } else if ("min" in compareTo && "max" in compareTo) {
        rightType = "value";
        rightValue = null; // handled by between operator
        rightLabel = `${compareTo.min}–${compareTo.max}`;
      } else if ("value" in compareTo) {
        rightType = "value";
        rightValue = Number(compareTo.value);
        rightLabel = String(compareTo.value);
      } else {
        rightLabel = JSON.stringify(compareTo);
      }
    } else if (compareTo != null) {
      rightType = "value";
      rightValue = Number(compareTo);
      rightLabel = String(compareTo);
    }

    // If compareTo is empty, use the condition value as the right side
    if (!rightLabel && c.value != null) {
      const val = c.value as any;
      if (typeof val === "object" && "min" in val && "max" in val) {
        rightLabel = `${val.min}–${val.max}`;
      } else if (typeof val === "object") {
        rightValue = Number(Object.values(val)[0] ?? 0);
        rightLabel = String(rightValue);
      } else {
        rightValue = Number(val);
        rightLabel = String(val);
      }
    }

    const opSymbol = OPERATOR_SYMBOLS[c.operator] || c.operator;
    const label = `${leftLabel} ${opSymbol} ${rightLabel}`;

    return {
      id: c.id,
      label,
      leftLabel,
      operator: c.operator,
      operatorSymbol: opSymbol,
      rightLabel,
      role: c.role,
      weight: c.weight,
      validation,
      leftIndicatorId: c.indicator_id,
      leftType,
      leftParams,
      rightType,
      rightValue,
      rightIndicatorType,
      rightIndicatorParams,
    };
  });
}

// ─── Condition Evaluation Result ────────────────────────────────────

export interface EvaluationResult {
  conditionId: string;
  passed: boolean;
  leftValue: number | null;
  rightValue: number | null;
  error?: string;
}

export function evaluateConditions(
  parsed: ParsedCondition[],
  ctx: MarketContext,
  direction: "long" | "short",
): EvaluationResult[] {
  return parsed.map(pc => {
    if (!pc.validation.valid) {
      return { conditionId: pc.id, passed: false, leftValue: null, rightValue: null, error: pc.validation.error };
    }

    // Resolve left value
    let leftVal: number | null;
    if (pc.leftType === "price") {
      leftVal = getPrice(ctx);
    } else {
      leftVal = resolveIndicatorValue(pc.leftType, pc.leftParams, ctx);
    }

    // Resolve right value
    let rightVal: number | null = pc.rightValue;
    if (pc.rightType === "indicator" && pc.rightIndicatorType) {
      rightVal = resolveIndicatorValue(pc.rightIndicatorType, pc.rightIndicatorParams, ctx);
    } else if (pc.rightType === "price") {
      rightVal = getPrice(ctx);
    }

    if (leftVal == null || isNaN(leftVal)) {
      return { conditionId: pc.id, passed: false, leftValue: null, rightValue: rightVal, error: "Sem dados" };
    }

    // For SHORT direction, invert directional operators
    let operator = pc.operator;
    if (direction === "short") {
      const invertMap: Record<string, string> = {
        ">": "<",
        "<": ">",
        ">=": "<=",
        "<=": ">=",
        "crosses_above": "crosses_below",
        "crosses_below": "crosses_above",
        "increasing": "decreasing",
        "decreasing": "increasing",
      };
      operator = invertMap[operator] || operator;
    }

    let passed = false;

    switch (operator) {
      case ">":
        passed = rightVal != null && leftVal > rightVal;
        break;
      case "<":
        passed = rightVal != null && leftVal < rightVal;
        break;
      case ">=":
        passed = rightVal != null && leftVal >= rightVal;
        break;
      case "<=":
        passed = rightVal != null && leftVal <= rightVal;
        break;
      case "==":
        passed = rightVal != null && Math.abs(leftVal - rightVal) < 0.001;
        break;
      case "between": {
        const val = pc.rightValue; // use original since between doesn't invert
        // Parse min/max from right label
        const parts = pc.rightLabel.split("–").map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          passed = leftVal >= parts[0] && leftVal <= parts[1];
        }
        break;
      }
      case "crosses_above": {
        const prevLeft = resolvePreviousIndicatorValue(pc.leftType, pc.leftParams, ctx);
        let prevRight = rightVal;
        if (pc.rightType === "indicator" && pc.rightIndicatorType) {
          prevRight = resolvePreviousIndicatorValue(pc.rightIndicatorType, pc.rightIndicatorParams, ctx);
        }
        if (prevLeft != null && prevRight != null && rightVal != null) {
          passed = prevLeft <= prevRight && leftVal > rightVal;
        }
        break;
      }
      case "crosses_below": {
        const prevLeft = resolvePreviousIndicatorValue(pc.leftType, pc.leftParams, ctx);
        let prevRight = rightVal;
        if (pc.rightType === "indicator" && pc.rightIndicatorType) {
          prevRight = resolvePreviousIndicatorValue(pc.rightIndicatorType, pc.rightIndicatorParams, ctx);
        }
        if (prevLeft != null && prevRight != null && rightVal != null) {
          passed = prevLeft >= prevRight && leftVal < rightVal;
        }
        break;
      }
      case "increasing": {
        const prevVal = resolvePreviousIndicatorValue(pc.leftType, pc.leftParams, ctx);
        passed = prevVal != null && leftVal > prevVal;
        break;
      }
      case "decreasing": {
        const prevVal = resolvePreviousIndicatorValue(pc.leftType, pc.leftParams, ctx);
        passed = prevVal != null && leftVal < prevVal;
        break;
      }
    }

    return { conditionId: pc.id, passed, leftValue: leftVal, rightValue: rightVal };
  });
}

// ─── Summary helpers ────────────────────────────────────────────────

export interface DirectionSummary {
  direction: "long" | "short";
  total: number;
  passed: number;
  ratio: number;
  status: "no_signal" | "almost" | "confirmed";
  missingConditions: string[];
}

export function summarizeDirection(
  parsed: ParsedCondition[],
  results: EvaluationResult[],
  direction: "long" | "short",
): DirectionSummary {
  const validParsed = parsed.filter(p => p.validation.valid);
  const total = validParsed.length;
  const passed = results.filter(r => {
    const p = parsed.find(pc => pc.id === r.conditionId);
    return p?.validation.valid && r.passed;
  }).length;
  const ratio = total > 0 ? passed / total : 0;

  const missing = validParsed
    .filter(p => {
      const r = results.find(res => res.conditionId === p.id);
      return r && !r.passed;
    })
    .map(p => p.label);

  let status: DirectionSummary["status"] = "no_signal";
  if (ratio === 1) status = "confirmed";
  else if (ratio >= 0.7) status = "almost";

  return { direction, total, passed, ratio, status, missingConditions: missing };
}

// ─── Get all indicator snapshots ────────────────────────────────────

export function getIndicatorSnapshots(
  indicators: Tables<"strategy_indicators">[],
  ctx: MarketContext,
): Record<string, number | null> {
  const snap: Record<string, number | null> = {};
  for (const ind of indicators) {
    if (!ind.enabled) continue;
    const key = indicatorLabel(ind.indicator_type, (ind.params as Record<string, unknown>) || null);
    snap[key] = resolveIndicatorValue(ind.indicator_type, (ind.params as Record<string, unknown>) || null, ctx);
  }
  return snap;
}

export { indicatorLabel, getPrice, calcATR };
