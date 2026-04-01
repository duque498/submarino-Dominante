import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BYBIT_BASE = "https://api.bybit.com";

// ─── Indicator Calculations ───

function calcEMA(closes: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    result.push(closes[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function calcRSI(closes: number[], period: number): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const result: number[] = [NaN];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    result.push(tr);
  }
  // SMA of TR for first period, then EMA
  const atr: number[] = new Array(result.length).fill(NaN);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += result[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < result.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + result[i]) / period;
  }
  return atr;
}

function calcMACD(closes: number[], fast: number, slow: number, signal: number) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = calcEMA(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcBBands(closes: number[], period: number, stddev: number) {
  const sma = calcSMA(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(sma[i])) { upper.push(NaN); lower.push(NaN); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - sma[i]) ** 2;
    const sd = Math.sqrt(variance / period);
    upper.push(sma[i] + stddev * sd);
    lower.push(sma[i] - stddev * sd);
  }
  return { upper, middle: sma, lower };
}

function calcVolumeSMA(volumes: number[], period: number) {
  const sma = calcSMA(volumes, period);
  const last = sma[sma.length - 1];
  const lastVol = volumes[volumes.length - 1];
  return { value: last, ratio: last > 0 ? lastVol / last : 0 };
}

// ─── Get current indicator value ───

interface Candle { open: number; high: number; low: number; close: number; volume: number; }

function getIndicatorValue(
  indicator: { indicator_type: string; params: Record<string, any> },
  candles: Candle[]
): Record<string, number> {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const p = indicator.params || {};
  const last = (arr: number[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i];
    return NaN;
  };
  const prev = (arr: number[]) => {
    let found = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (!isNaN(arr[i])) { found++; if (found === 2) return arr[i]; }
    }
    return NaN;
  };

  switch (indicator.indicator_type) {
    case "ema": {
      const vals = calcEMA(closes, p.period || 21);
      return { value: last(vals), prev_value: prev(vals) };
    }
    case "sma": {
      const vals = calcSMA(closes, p.period || 50);
      return { value: last(vals), prev_value: prev(vals) };
    }
    case "rsi": {
      const vals = calcRSI(closes, p.period || 14);
      return { value: last(vals), prev_value: prev(vals) };
    }
    case "macd": {
      const m = calcMACD(closes, p.fast || 12, p.slow || 26, p.signal || 9);
      return { macd: last(m.macd), signal: last(m.signal), histogram: last(m.histogram), prev_histogram: prev(m.histogram) };
    }
    case "bbands": {
      const bb = calcBBands(closes, p.period || 20, p.stddev || 2);
      return { upper: last(bb.upper), middle: last(bb.middle), lower: last(bb.lower) };
    }
    case "atr": {
      const atr = calcATR(highs, lows, closes, p.period || 14);
      return { value: last(atr) };
    }
    case "volatility_pct": {
      const atr = calcATR(highs, lows, closes, p.period || 14);
      const atrVal = last(atr);
      const price = closes[closes.length - 1];
      return { value: price > 0 ? (atrVal / price) * 100 : 0 };
    }
    case "volume_sma": {
      const vs = calcVolumeSMA(volumes, p.period || 20);
      return { value: vs.value, ratio: vs.ratio };
    }
    case "adx": {
      // Simplified ADX
      return { adx: 25 }; // placeholder - real ADX is complex
    }
    case "supertrend": {
      const atr = calcATR(highs, lows, closes, p.period || 10);
      const mult = p.multiplier || 3;
      const atrVal = last(atr);
      const hl2 = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
      const upper = hl2 + mult * atrVal;
      const lower = hl2 - mult * atrVal;
      const price = closes[closes.length - 1];
      return { value: price > lower ? lower : upper, direction: price > lower ? 1 : -1 };
    }
    case "pct_change": {
      const period = p.period || 1;
      const idx = closes.length - 1;
      const prevIdx = idx - period;
      if (prevIdx < 0) return { value: 0 };
      return { value: ((closes[idx] - closes[prevIdx]) / closes[prevIdx]) * 100 };
    }
    default:
      return { value: closes[closes.length - 1] };
  }
}

// ─── Evaluate condition ───

function evaluateCondition(
  condition: any,
  indicatorValues: Map<string, Record<string, number>>,
  currentPrice: number
): boolean {
  const { operator, value, compare_to, indicator_id, condition_type } = condition;

  // Determine left-hand value
  let lhv: number = currentPrice;
  if (indicator_id && indicatorValues.has(indicator_id)) {
    const vals = indicatorValues.get(indicator_id)!;
    if (typeof value === "object" && value?.output) {
      lhv = vals[value.output] ?? vals.value ?? currentPrice;
    } else {
      lhv = vals.value ?? currentPrice;
    }
  }

  // Determine right-hand value
  let rhv: number = 0;
  if (typeof value === "object") {
    if (value?.min !== undefined && value?.max !== undefined) {
      // between case
      if (operator === "between") return lhv >= value.min && lhv <= value.max;
    }
    rhv = value?.value ?? value?.threshold ?? 0;
  } else if (typeof value === "number") {
    rhv = value;
  }

  // Compare_to can override the right value
  if (compare_to && typeof compare_to === "object" && compare_to.indicator_id) {
    const compVals = indicatorValues.get(compare_to.indicator_id);
    if (compVals) rhv = compVals[compare_to.output || "value"] ?? compVals.value ?? rhv;
  }

  switch (operator) {
    case ">": return lhv > rhv;
    case "<": return lhv < rhv;
    case ">=": return lhv >= rhv;
    case "<=": return lhv <= rhv;
    case "==": return Math.abs(lhv - rhv) < 0.0001;
    case "crosses_above": {
      // Need prev values
      if (indicator_id && indicatorValues.has(indicator_id)) {
        const vals = indicatorValues.get(indicator_id)!;
        const prevLhv = vals.prev_value ?? lhv;
        return prevLhv <= rhv && lhv > rhv;
      }
      return lhv > rhv;
    }
    case "crosses_below": {
      if (indicator_id && indicatorValues.has(indicator_id)) {
        const vals = indicatorValues.get(indicator_id)!;
        const prevLhv = vals.prev_value ?? lhv;
        return prevLhv >= rhv && lhv < rhv;
      }
      return lhv < rhv;
    }
    case "increasing": return lhv > rhv;
    case "decreasing": return lhv < rhv;
    default: return false;
  }
}

// ─── Fetch Bybit klines ───

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<Candle[]> {
  const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) { await res.text(); return []; }
  const data = await res.json();
  if (!data.result?.list) return [];
  // Bybit returns newest first, reverse for chronological
  return data.result.list.reverse().map((k: string[]) => ({
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// ─── Calculate score ───

function calculateScore(
  conditions: any[],
  conditionResults: boolean[],
  weights: Record<string, number>
): number {
  const requiredConditions = conditions.filter(c => c.role === "required");
  const scoreConditions = conditions.filter(c => c.role === "score");
  
  // All required conditions must pass
  for (let i = 0; i < conditions.length; i++) {
    if (conditions[i].role === "required" && !conditionResults[i]) return 0;
  }
  
  if (conditions.length === 0) return 0;

  // Score based on weight of passing conditions
  let totalWeight = 0;
  let passedWeight = 0;
  for (let i = 0; i < conditions.length; i++) {
    const w = conditions[i].weight || 10;
    totalWeight += w;
    if (conditionResults[i]) passedWeight += w;
  }
  
  return totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0;
}

// ─── Calculate entry/stop/targets ───

function calculateLevels(
  candles: Candle[],
  direction: string,
  riskRules: any
) {
  const price = candles[candles.length - 1].close;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  
  const atr = calcATR(highs, lows, closes, 14);
  let atrVal = 0;
  for (let i = atr.length - 1; i >= 0; i--) { if (!isNaN(atr[i])) { atrVal = atr[i]; break; } }
  
  const stopMultiplier = riskRules?.stopValue || 1.5;
  const isLong = direction === "long";
  
  const stopDistance = atrVal * stopMultiplier;
  const entryPrice = price;
  const stopPrice = isLong ? price - stopDistance : price + stopDistance;
  const target1Price = isLong ? price + stopDistance * 1.5 : price - stopDistance * 1.5;
  const target2Price = isLong ? price + stopDistance * 2.5 : price - stopDistance * 2.5;
  const rrRatio = stopDistance > 0 ? (Math.abs(target1Price - entryPrice) / stopDistance) : 0;
  
  return { entryPrice, stopPrice, target1Price, target2Price, rrRatio };
}

// ─── Main handler ───

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch all active strategies with their related data
    const { data: strategies, error: stratErr } = await supabase
      .from("strategies")
      .select("*")
      .eq("active", true);

    if (stratErr) throw stratErr;
    if (!strategies || strategies.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, signals: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSignals = 0;
    const now = new Date();

    for (const strategy of strategies) {
      // Check time window
      if (strategy.time_window_start && strategy.time_window_end) {
        const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
        if (hhmm < strategy.time_window_start || hhmm > strategy.time_window_end) continue;
      }

      // Fetch strategy sub-data
      const [symbolsRes, timeframesRes, indicatorsRes, conditionsRes, weightsRes] = await Promise.all([
        supabase.from("strategy_symbols").select("symbol").eq("strategy_id", strategy.id),
        supabase.from("strategy_timeframes").select("timeframe").eq("strategy_id", strategy.id),
        supabase.from("strategy_indicators").select("*").eq("strategy_id", strategy.id).eq("enabled", true),
        supabase.from("strategy_conditions").select("*").eq("strategy_id", strategy.id).order("sort_order"),
        supabase.from("strategy_weights").select("*").eq("strategy_id", strategy.id),
      ]);

      const symbols = (symbolsRes.data || []).map(s => s.symbol);
      const timeframes = (timeframesRes.data || []).map(t => t.timeframe);
      const indicators = indicatorsRes.data || [];
      const conditions = conditionsRes.data || [];

      if (symbols.length === 0 || timeframes.length === 0 || conditions.length === 0) continue;

      const weightMap: Record<string, number> = {};
      (weightsRes.data || []).forEach(w => { weightMap[w.block_name] = w.weight; });

      for (const symbol of symbols) {
        for (const timeframe of timeframes) {
          // Cooldown check: skip if signal was generated recently
          const cooldownMinutes = strategy.cooldown_minutes || 30;
          const cooldownThreshold = new Date(now.getTime() - cooldownMinutes * 60 * 1000).toISOString();
          
          const { data: recentSignals } = await supabase
            .from("signals")
            .select("id")
            .eq("user_id", strategy.user_id)
            .eq("strategy_id", strategy.id)
            .eq("symbol", symbol)
            .eq("timeframe", timeframe)
            .gte("created_at", cooldownThreshold)
            .limit(1);

          if (recentSignals && recentSignals.length > 0) continue;

          // Daily limit check
          const todayStart = new Date(now);
          todayStart.setUTCHours(0, 0, 0, 0);
          const maxDaily = strategy.max_alerts_per_symbol_per_day || 5;
          
          const { count: dailyCount } = await supabase
            .from("signals")
            .select("id", { count: "exact", head: true })
            .eq("user_id", strategy.user_id)
            .eq("strategy_id", strategy.id)
            .eq("symbol", symbol)
            .gte("created_at", todayStart.toISOString());

          if ((dailyCount || 0) >= maxDaily) continue;

          // Fetch candles from Bybit
          const candles = await fetchKlines(symbol, timeframe, 200);
          if (candles.length < 50) continue;

          // Calculate all indicator values
          const indicatorValues = new Map<string, Record<string, number>>();
          for (const ind of indicators) {
            try {
              const vals = getIndicatorValue(ind, candles);
              indicatorValues.set(ind.id, vals);
            } catch { /* skip broken indicator */ }
          }

          // Evaluate all conditions
          const currentPrice = candles[candles.length - 1].close;
          const conditionResults = conditions.map(c =>
            evaluateCondition(c, indicatorValues, currentPrice)
          );

          // Calculate score
          const score = calculateScore(conditions, conditionResults, weightMap);

          // Check minimum score
          const minScore = strategy.score_min || 60;
          if (score < minScore) continue;

          // Determine direction
          let direction = strategy.direction;
          if (direction === "both") {
            // Simple heuristic: if price > EMA200 → long, else short
            const ema200 = calcEMA(candles.map(c => c.close), Math.min(200, candles.length - 1));
            const emaVal = ema200[ema200.length - 1];
            direction = currentPrice > emaVal ? "long" : "short";
          }

          // Check R/R minimum
          const levels = calculateLevels(candles, direction, strategy.risk_rules);
          if (strategy.min_rr && levels.rrRatio < strategy.min_rr) continue;

          // Build indicator snapshot
          const indicatorSnapshot: Record<string, any> = {};
          for (const [id, vals] of indicatorValues) {
            const ind = indicators.find(i => i.id === id);
            if (ind) indicatorSnapshot[ind.indicator_type] = vals;
          }

          // Build justification
          const passedFilters = conditions.filter((_, i) => conditionResults[i]).map(c => c.condition_type);
          const failedFilters = conditions.filter((_, i) => !conditionResults[i]).map(c => c.condition_type);

          // Insert signal
          const { error: sigErr } = await supabase.from("signals").insert({
            user_id: strategy.user_id,
            strategy_id: strategy.id,
            symbol,
            market: strategy.market,
            timeframe,
            direction,
            score,
            score_breakdown: weightMap,
            entry_price: levels.entryPrice,
            stop_price: levels.stopPrice,
            target1_price: levels.target1Price,
            target2_price: levels.target2Price,
            rr_ratio: levels.rrRatio,
            indicator_snapshot: indicatorSnapshot,
            filters_passed: passedFilters,
            filters_failed: failedFilters,
            justification: `Score ${score}/100 — ${passedFilters.length}/${conditions.length} condições atendidas`,
            market_context: {
              price: currentPrice,
              volume: candles[candles.length - 1].volume,
            },
          });

          if (sigErr) {
            console.error("Signal insert error:", sigErr);
          } else {
            totalSignals++;

            // Create alert for the user
            const { data: sigData } = await supabase
              .from("signals")
              .select("id")
              .eq("user_id", strategy.user_id)
              .eq("strategy_id", strategy.id)
              .eq("symbol", symbol)
              .eq("timeframe", timeframe)
              .order("created_at", { ascending: false })
              .limit(1);

            if (sigData && sigData.length > 0) {
              await supabase.from("alerts").insert({
                user_id: strategy.user_id,
                signal_id: sigData[0].id,
                status: "pending",
              });
            }

            // Send notifications to ALL channels
            const dirLabel = direction === "long" ? "🟢 LONG" : "🔴 SHORT";
            const notifTitle = `${dirLabel} ${symbol} — Score ${score}`;
            const notifBody = `${strategy.name} | Entry: $${levels.entryPrice.toFixed(2)} | TP: $${levels.target1Price.toFixed(2)} | SL: $${levels.stopPrice.toFixed(2)}`;
            const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

            // Push notification
            const { data: subs } = await supabase
              .from("push_subscriptions")
              .select("endpoint, p256dh, auth")
              .eq("user_id", strategy.user_id);

            if (subs && subs.length > 0) {
              try {
                const pushUrl = `${SUPABASE_URL}/functions/v1/send-push`;
                await fetch(pushUrl, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                  },
                  body: JSON.stringify({
                    user_id: strategy.user_id,
                    title: notifTitle,
                    body: notifBody,
                    tag: `signal-${symbol}-${direction}`,
                    data: { url: `/grafico?symbol=${symbol}` },
                    requireInteraction: true,
                  }),
                });
              } catch (pushErr) {
                console.error("Push notification error:", pushErr);
              }
            }

            // Telegram notification
            try {
              const telegramUrl = `${SUPABASE_URL}/functions/v1/send-telegram`;
              await fetch(telegramUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                },
                body: JSON.stringify({
                  user_id: strategy.user_id,
                  title: `${dirLabel} ${symbol} — Score ${score}`,
                  body: `📊 ${strategy.name}\n💰 Entry: $${levels.entryPrice.toFixed(2)}\n🎯 TP: $${levels.target1Price.toFixed(2)}\n🛑 SL: $${levels.stopPrice.toFixed(2)}\n📈 R/R: ${levels.rrRatio.toFixed(2)}`,
                }),
              });
            } catch (tgErr) {
              console.error("Telegram notification error:", tgErr);
            }
          }
        }
      }
    }

    console.log(`Scan complete: ${strategies.length} strategies, ${totalSignals} signals generated`);

    return new Response(
      JSON.stringify({ scanned: strategies.length, signals: totalSignals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scan-strategies error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
