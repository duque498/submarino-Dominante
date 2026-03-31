import { useState, useEffect, useRef, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradingViewChart } from "@/components/chart/TradingViewChart";
import { useTickers, useKlines, useOpenInterest, useFundingRate } from "@/hooks/use-bybit";
import { useStrategies } from "@/hooks/use-strategies";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Puzzle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { playConditionTick, playEntryAlert } from "@/lib/audio-notifications";
import { toast } from "sonner";
import type { BybitCategory, CandleData, TickerData } from "@/services/bybit";
import type { Tables } from "@/integrations/supabase/types";

// Simple EMA/SMA calculator for live condition evaluation
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function getIndicatorValue(
  indType: string,
  params: Record<string, unknown> | null,
  candles: CandleData[] | undefined,
  ticker: TickerData | undefined,
  oi: { openInterest: number } | undefined,
  funding: { fundingRate: number } | undefined,
): number | null {
  if (!candles?.length) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
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
      return ticker?.lastPrice ?? null; // simplified
    case "open_interest":
      return oi?.openInterest ?? null;
    case "funding_rate":
      return funding ? funding.fundingRate * 100 : null;
    case "atr": {
      const period = Number(p.period || 14);
      if (candles.length < period + 1) return null;
      const trs = candles.slice(-period - 1).map((c, i, arr) => {
        if (i === 0) return 0;
        const prev = arr[i - 1];
        return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
      }).slice(1);
      return trs.reduce((s, v) => s + v, 0) / period;
    }
    case "spread":
      return ticker?.spread ?? null;
    default:
      return null;
  }
}

function evaluateCondition(
  condition: Tables<"strategy_conditions">,
  indicator: Tables<"strategy_indicators"> | undefined,
  ticker: TickerData | undefined,
  candles: CandleData[] | undefined,
  oi: { openInterest: number } | undefined,
  funding: { fundingRate: number } | undefined,
): boolean {
  if (!indicator && !condition.condition_type) return false;

  const indType = indicator?.indicator_type || condition.condition_type;
  const params = (indicator?.params ?? null) as Record<string, unknown> | null;
  const value = getIndicatorValue(indType, params, candles, ticker, oi, funding);

  if (value === null || isNaN(value)) return false;

  const condVal = condition.value as any;
  const op = condition.operator;

  switch (op) {
    case ">": return value > Number(condVal);
    case "<": return value < Number(condVal);
    case ">=": return value >= Number(condVal);
    case "<=": return value <= Number(condVal);
    case "==": return Math.abs(value - Number(condVal)) < 0.001;
    case "between":
      return value >= Number(condVal?.min) && value <= Number(condVal?.max);
    case "crosses_above": {
      // Simplified: check if current value is above target
      return value > Number(condVal);
    }
    case "crosses_below": {
      return value < Number(condVal);
    }
    case "increasing": {
      if (!candles || candles.length < 3) return false;
      const closes = candles.map((c) => c.close);
      const prev = indType === "ema"
        ? calcEMA(closes.slice(0, -1), Number(params?.period || 21))
        : calcSMA(closes.slice(0, -1), Number(params?.period || 50));
      return value > prev;
    }
    case "decreasing": {
      if (!candles || candles.length < 3) return false;
      const closes = candles.map((c) => c.close);
      const prev = indType === "ema"
        ? calcEMA(closes.slice(0, -1), Number(params?.period || 21))
        : calcSMA(closes.slice(0, -1), Number(params?.period || 50));
      return value < prev;
    }
    default:
      return false;
  }
}

export default function ChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const category = (searchParams.get("category") || "linear") as BybitCategory;
  const [timeframe, setTimeframe] = useState(searchParams.get("tf") || "5m");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("none");
  const timeframes = ["1m", "5m", "15m", "1h", "4h"];

  const { data: tickers } = useTickers(category, symbol);
  const { data: oiData } = useOpenInterest(symbol, category);
  const { data: fundingData } = useFundingRate(symbol, category);
  const { data: strategies } = useStrategies();
  const { data: candles } = useKlines(symbol, timeframe, category, 200);

  const ticker = tickers?.[0];
  const latestOI = oiData?.[0];
  const latestFunding = fundingData?.[0];

  const activeStrategy = strategies?.find((s) => s.id === selectedStrategyId);
  const activeStrategies = strategies?.filter((s) => s.active) || [];

  const setSymbol = (s: string) => {
    setSearchParams({ symbol: s, category, tf: timeframe });
  };

  // Get ALL enabled indicators for TradingView chart
  const chartIndicators = activeStrategy?.indicators
    ?.filter((i) => i.enabled)
    ?.map((i) => ({
      indicator_type: i.indicator_type,
      params: i.params as Record<string, unknown> | null,
      enabled: i.enabled,
      plot_on_chart: i.plot_on_chart,
    })) || [];

  // Conditions from strategy for checklist — separate by direction context
  const conditions = activeStrategy?.conditions || [];
  const strategyDirection = activeStrategy?.direction || "both";

  // Evaluate conditions for LONG
  const longResults = useMemo(() => {
    if (!conditions.length) return [];
    return conditions.map((c) => {
      const ind = activeStrategy?.indicators.find((i) => i.id === c.indicator_id);
      return evaluateCondition(c, ind, ticker, candles, latestOI, latestFunding);
    });
  }, [conditions, activeStrategy, ticker, candles, latestOI, latestFunding]);

  // Evaluate conditions for SHORT (invert directional conditions)
  const shortResults = useMemo(() => {
    if (!conditions.length) return [];
    return conditions.map((c) => {
      const ind = activeStrategy?.indicators.find((i) => i.id === c.indicator_id);
      // For directional operators, evaluate inversely
      const inverted = { ...c };
      if (c.operator === "crosses_above") inverted.operator = "crosses_below";
      else if (c.operator === "crosses_below") inverted.operator = "crosses_above";
      else if (c.operator === ">") inverted.operator = "<";
      else if (c.operator === "<") inverted.operator = ">";
      else if (c.operator === ">=") inverted.operator = "<=";
      else if (c.operator === "<=") inverted.operator = ">=";
      return evaluateCondition(inverted as any, ind, ticker, candles, latestOI, latestFunding);
    });
  }, [conditions, activeStrategy, ticker, candles, latestOI, latestFunding]);

  // Use appropriate results based on direction
  const conditionResults = strategyDirection === "both" ? longResults : longResults;
  const longPassedCount = longResults.filter(Boolean).length;
  const shortPassedCount = shortResults.filter(Boolean).length;
  const passedCount = longPassedCount;
  const totalConditions = conditions.length;
  const passedRatio = totalConditions > 0 ? Math.max(longPassedCount, shortPassedCount) / totalConditions : 0;
  const bestDirection = longPassedCount >= shortPassedCount ? "long" : "short";
  const bestPassedCount = Math.max(longPassedCount, shortPassedCount);

  // Track previous state for sound transitions
  const prevResultsRef = useRef<boolean[]>([]);
  const entryAlertFiredRef = useRef(false);

  useEffect(() => {
    if (!conditionResults.length) return;
    const prev = prevResultsRef.current;

    // Play tick when a condition newly passes
    if (prev.length === conditionResults.length) {
      for (let i = 0; i < conditionResults.length; i++) {
        if (conditionResults[i] && !prev[i]) {
          playConditionTick();
          break;
        }
      }
    }

    // Play entry alert when crossing 60% threshold (for best direction)
    const bestRatio = totalConditions > 0 ? bestPassedCount / totalConditions : 0;
    if (bestRatio >= 0.6 && !entryAlertFiredRef.current) {
      entryAlertFiredRef.current = true;
      playEntryAlert();
      toast.success(`🎯 Possível entrada ${bestDirection === "long" ? "LONG 🟢" : "SHORT 🔴"}! ${bestPassedCount}/${totalConditions} condições`, {
        description: `${symbol} — ${activeStrategy?.name}`,
        duration: 10000,
      });
    } else if (bestRatio < 0.6) {
      entryAlertFiredRef.current = false;
    }

    prevResultsRef.current = [...conditionResults];
  }, [conditionResults, bestPassedCount, totalConditions, bestDirection, symbol, activeStrategy?.name]);

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-mono text-foreground">{symbol}</h1>
          {ticker && (
            <>
              <span className="font-mono text-lg text-foreground">${ticker.lastPrice.toLocaleString()}</span>
              <Badge variant={ticker.change24h >= 0 ? "bull" : "bear"}>
                {ticker.change24h >= 0 ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                {ticker.change24h >= 0 ? "+" : ""}{ticker.change24h.toFixed(2)}%
              </Badge>
            </>
          )}
          <Badge variant="outline" className="text-[10px] font-mono">{category === "linear" ? "PERP" : "SPOT"}</Badge>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map((s) => (
            <Button
              key={s}
              variant={symbol === s ? "default" : "ghost"}
              size="sm"
              className="font-mono text-xs"
              onClick={() => setSymbol(s)}
            >
              {s.replace("USDT", "")}
            </Button>
          ))}
          <div className="mx-2 h-4 w-px bg-border" />
          {timeframes.map((tf) => (
            <Button
              key={tf}
              variant={timeframe === tf ? "default" : "secondary"}
              size="sm"
              className="font-mono text-xs"
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </Button>
          ))}
        </div>
      </div>

      {/* Strategy selector */}
      <div className="flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Estratégia:</span>
        <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
          <SelectTrigger className="w-64 h-8 text-xs">
            <SelectValue placeholder="Selecione uma estratégia" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem estratégia</SelectItem>
            {activeStrategies.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} ({s.indicators.length} indicadores)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeStrategy && (
          <Badge variant="outline" className="text-[10px]">
            {activeStrategy.indicators.filter((i) => i.enabled).length} indicadores ativos
          </Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* TradingView Chart */}
        <div>
          <TradingViewChart
            symbol={symbol}
            timeframe={timeframe}
            category={category}
            height={520}
            indicators={chartIndicators}
          />
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Market Data */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Dados do Mercado</h3>
            <div className="space-y-2 text-xs">
              {ticker && (
                <>
                  {[
                    ["Último", `$${ticker.lastPrice.toLocaleString()}`],
                    ["Bid", `$${ticker.bid.toLocaleString()}`],
                    ["Ask", `$${ticker.ask.toLocaleString()}`],
                    ["Spread", `${ticker.spread.toFixed(4)}%`],
                    ["Alta 24h", `$${ticker.high24h.toLocaleString()}`],
                    ["Baixa 24h", `$${ticker.low24h.toLocaleString()}`],
                    ["Volume 24h", `${Number(ticker.volume24h).toLocaleString()}`],
                    ["Turnover", `$${(Number(ticker.turnover24h) / 1e6).toFixed(1)}M`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono text-foreground">{value}</span>
                    </div>
                  ))}
                </>
              )}
              {category === "linear" && (
                <>
                  <div className="my-2 border-t border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open Interest</span>
                    <span className="font-mono text-foreground">
                      {latestOI ? latestOI.openInterest.toLocaleString() : ticker?.openInterest || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Funding Rate</span>
                    <span className={`font-mono ${latestFunding && latestFunding.fundingRate > 0 ? "text-bull" : latestFunding && latestFunding.fundingRate < 0 ? "text-bear" : "text-foreground"}`}>
                      {latestFunding ? `${(latestFunding.fundingRate * 100).toFixed(4)}%` : ticker?.fundingRate ? `${(Number(ticker.fundingRate) * 100).toFixed(4)}%` : "—"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Strategy indicators list */}
          {activeStrategy && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Indicadores — {activeStrategy.name}
              </h3>
              <div className="space-y-1.5">
                {activeStrategy.indicators
                  .filter((i) => i.enabled)
                  .map((ind) => {
                    const params = ind.params as Record<string, unknown> | null;
                    const paramStr = params
                      ? Object.entries(params)
                          .filter(([k]) => k !== "source")
                          .map(([, v]) => v)
                          .join(", ")
                      : "";
                    return (
                      <div key={ind.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${ind.plot_on_chart ? "bg-primary" : "bg-muted"}`} />
                          <span className="text-foreground font-mono">
                            {ind.indicator_type.toUpperCase()}
                            {paramStr && ` (${paramStr})`}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[8px] px-1">
                          {ind.role}
                        </Badge>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Conditions checklist — live evaluation */}
          {activeStrategy && conditions.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Condições (ao vivo)</h3>
              <div className="space-y-1.5">
                {conditions.map((c) => {
                  const indicator = activeStrategy.indicators.find((i) => i.id === c.indicator_id);
                  const indName = indicator
                    ? indicator.indicator_type.toUpperCase()
                    : c.condition_type;

                  // Format value for display
                  const val = c.value as any;
                  let valueStr = "";
                  if (val && typeof val === "object" && "min" in val && "max" in val) {
                    valueStr = `${val.min} e ${val.max}`;
                  } else if (typeof val === "object") {
                    valueStr = Object.values(val).join(", ");
                  } else {
                    valueStr = String(val ?? "");
                  }

                  const opMap: Record<string, string> = {
                    ">": "maior que",
                    "<": "menor que",
                    ">=": "≥",
                    "<=": "≤",
                    "==": "igual a",
                    "crosses_above": "cruza acima de",
                    "crosses_below": "cruza abaixo de",
                    "between": "entre",
                    "increasing": "subindo",
                    "decreasing": "descendo",
                  };
                  const opStr = opMap[c.operator] || c.operator;

                  // --- Live evaluation ---
                  const passed = evaluateCondition(c, indicator, ticker, candles, latestOI, latestFunding);

                  return (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      {passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-bull" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-bear" />
                      )}
                      <span className={passed ? "text-foreground" : "text-muted-foreground"}>
                        {indName} {opStr} {valueStr}
                      </span>
                      {c.role === "required" && (
                        <Badge variant="outline" className="ml-auto text-[8px] px-1">Obrig.</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Summary */}
              {(() => {
                const total = conditions.length;
                const passedCount = conditions.filter((c) => {
                  const ind = activeStrategy.indicators.find((i) => i.id === c.indicator_id);
                  return evaluateCondition(c, ind, ticker, candles, latestOI, latestFunding);
                }).length;
                return (
                  <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Resultado</span>
                    <span className={`font-mono font-bold ${passedCount === total ? "text-bull" : passedCount >= total * 0.6 ? "text-yellow-400" : "text-bear"}`}>
                      {passedCount}/{total} condições
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* No strategy selected */}
          {!activeStrategy && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Puzzle className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">
                Selecione uma estratégia para ver indicadores no gráfico
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
