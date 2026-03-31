import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradingViewChart } from "@/components/chart/TradingViewChart";
import { EntryHubModal, type EntrySignalData } from "@/components/chart/EntryHubModal";
import { useTickers, useKlines, useOpenInterest, useFundingRate } from "@/hooks/use-bybit";
import { useStrategies } from "@/hooks/use-strategies";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Puzzle, Volume2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { playConditionTick, playEntryAlert, sendEntryPushNotification } from "@/lib/audio-notifications";
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

// ===== Scalp condition definitions =====
interface ScalpCondition {
  label: string;
  evaluate: (close: number, ema9: number, ema21: number, ema200: number, rsi: number) => boolean;
}

const LONG_CONDITIONS: ScalpCondition[] = [
  { label: "close > EMA 9", evaluate: (close, ema9) => close > ema9 },
  { label: "close > EMA 21", evaluate: (close, _e9, ema21) => close > ema21 },
  { label: "close > EMA 200", evaluate: (close, _e9, _e21, ema200) => close > ema200 },
  { label: "EMA 9 > EMA 21", evaluate: (_c, ema9, ema21) => ema9 > ema21 },
  { label: "EMA 21 > EMA 200", evaluate: (_c, _e9, ema21, ema200) => ema21 > ema200 },
  { label: "RSI 14 > 50", evaluate: (_c, _e9, _e21, _e200, rsi) => rsi > 50 },
  { label: "RSI 14 < 70", evaluate: (_c, _e9, _e21, _e200, rsi) => rsi < 70 },
];

const SHORT_CONDITIONS: ScalpCondition[] = [
  { label: "close < EMA 9", evaluate: (close, ema9) => close < ema9 },
  { label: "close < EMA 21", evaluate: (close, _e9, ema21) => close < ema21 },
  { label: "close < EMA 200", evaluate: (close, _e9, _e21, ema200) => close < ema200 },
  { label: "EMA 9 < EMA 21", evaluate: (_c, ema9, ema21) => ema9 < ema21 },
  { label: "EMA 21 < EMA 200", evaluate: (_c, _e9, ema21, ema200) => ema21 < ema200 },
  { label: "RSI 14 < 50", evaluate: (_c, _e9, _e21, _e200, rsi) => rsi < 50 },
  { label: "RSI 14 > 30", evaluate: (_c, _e9, _e21, _e200, rsi) => rsi > 30 },
];

function useScalpConditions(candles: CandleData[] | undefined) {
  return useMemo(() => {
    if (!candles || candles.length < 201) {
      return { ema9: NaN, ema21: NaN, ema200: NaN, rsi: NaN, close: NaN, longResults: [] as boolean[], shortResults: [] as boolean[] };
    }
    const closes = candles.map(c => c.close);
    const close = closes[closes.length - 1];
    const ema9 = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const ema200 = calcEMA(closes, 200);
    const rsi = calcRSI(closes, 14);

    const longResults = LONG_CONDITIONS.map(c => !isNaN(ema9) && !isNaN(ema21) && !isNaN(ema200) && !isNaN(rsi) && c.evaluate(close, ema9, ema21, ema200, rsi));
    const shortResults = SHORT_CONDITIONS.map(c => !isNaN(ema9) && !isNaN(ema21) && !isNaN(ema200) && !isNaN(rsi) && c.evaluate(close, ema9, ema21, ema200, rsi));

    return { ema9, ema21, ema200, rsi, close, longResults, shortResults };
  }, [candles]);
}

// Keep old evaluateCondition for compatibility with DB conditions
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
    case "between": return value >= Number(condVal?.min) && value <= Number(condVal?.max);
    default: return false;
  }
}
export default function ChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const category = (searchParams.get("category") || "linear") as BybitCategory;
  const [timeframe, setTimeframe] = useState(searchParams.get("tf") || "15m");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("none");
  const [entryHubOpen, setEntryHubOpen] = useState(false);
  const [entrySignal, setEntrySignal] = useState<EntrySignalData | null>(null);
  const [isTestEntry, setIsTestEntry] = useState(false);
  const timeframes = ["1m", "5m", "15m", "1h", "4h"];

  const { data: tickers } = useTickers(category, symbol);
  const { data: oiData } = useOpenInterest(symbol, category);
  const { data: fundingData } = useFundingRate(symbol, category);
  const { data: strategies } = useStrategies();
  const { data: candles } = useKlines(symbol, timeframe, category, 300);

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

  // ===== Scalp condition evaluation =====
  const scalp = useScalpConditions(candles);
  const { longResults, shortResults } = scalp;
  const longPassedCount = longResults.filter(Boolean).length;
  const shortPassedCount = shortResults.filter(Boolean).length;
  const totalConditions = 7;
  const bestDirection = longPassedCount >= shortPassedCount ? "long" : "short";
  const bestPassedCount = Math.max(longPassedCount, shortPassedCount);

  // Build entry signal data for the hub modal
  const buildEntrySignal = useCallback((dir: "long" | "short", test = false): EntrySignalData | null => {
    if (!candles || candles.length < 20) return null;
    const price = candles[candles.length - 1].close;
    const period = 14;
    const trs: number[] = [];
    for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
      const prev = candles[i - 1];
      const c = candles[i];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
    }
    const atr = trs.length > 0 ? trs.reduce((a, b) => a + b, 0) / trs.length : price * 0.01;
    const isLong = dir === "long";
    const stopDist = atr * 1.5;
    const entry = price;
    const stop = isLong ? price - stopDist : price + stopDist;
    const tp1 = isLong ? price + stopDist * 1.5 : price - stopDist * 1.5;
    const tp2 = isLong ? price + stopDist * 2.5 : price - stopDist * 2.5;
    const rr = stopDist > 0 ? Math.abs(tp1 - entry) / stopDist : 0;

    const condDefs = dir === "long" ? LONG_CONDITIONS : SHORT_CONDITIONS;
    const results = dir === "long" ? longResults : shortResults;
    const condDetails = condDefs.map((c, i) => ({ name: c.label, passed: results[i] ?? false }));

    const indSnap: Record<string, number | null> = {
      ema9: scalp.ema9,
      ema21: scalp.ema21,
      ema200: scalp.ema200,
      rsi14: scalp.rsi,
    };

    const passed = results.filter(Boolean).length;
    return {
      symbol,
      direction: dir,
      strategyName: activeStrategy?.name || (test ? "Scalp BTC 15m" : "Scalp Monitor"),
      score: Math.round((passed / totalConditions) * 100),
      totalConditions,
      passedConditions: passed,
      entryPrice: entry,
      stopPrice: stop,
      target1Price: tp1,
      target2Price: tp2,
      rrRatio: rr,
      timeframe,
      market: category,
      conditionDetails: condDetails,
      indicatorSnapshot: indSnap,
    };
  }, [candles, longResults, shortResults, scalp, activeStrategy, symbol, timeframe, category, totalConditions]);

  // Track previous state for sound transitions
  const prevLongRef = useRef<boolean[]>([]);
  const prevShortRef = useRef<boolean[]>([]);
  const entryAlertFiredRef = useRef(false);

  useEffect(() => {
    // Tick sound when any condition flips to true
    const prevL = prevLongRef.current;
    const prevS = prevShortRef.current;
    if (prevL.length === longResults.length) {
      for (let i = 0; i < longResults.length; i++) {
        if (longResults[i] && !prevL[i]) { playConditionTick(); break; }
      }
    }
    if (prevS.length === shortResults.length) {
      for (let i = 0; i < shortResults.length; i++) {
        if (shortResults[i] && !prevS[i]) { playConditionTick(); break; }
      }
    }

    // Alert only when ALL 7/7 conditions are met
    if ((longPassedCount === 7 || shortPassedCount === 7) && !entryAlertFiredRef.current) {
      entryAlertFiredRef.current = true;
      const dir = longPassedCount === 7 ? "long" : "short";
      playEntryAlert();
      const sig = buildEntrySignal(dir as "long" | "short");
      if (sig) {
        setEntrySignal(sig);
        setIsTestEntry(false);
        setEntryHubOpen(true);
        sendEntryPushNotification({
          symbol: sig.symbol,
          direction: sig.direction,
          score: sig.score,
          passedConditions: sig.passedConditions,
          totalConditions: sig.totalConditions,
          entryPrice: sig.entryPrice,
          stopPrice: sig.stopPrice,
          targetPrice: sig.target1Price,
          strategyName: sig.strategyName,
          onClick: () => setEntryHubOpen(true),
        });
      }
    } else if (longPassedCount < 7 && shortPassedCount < 7) {
      entryAlertFiredRef.current = false;
    }

    prevLongRef.current = [...longResults];
    prevShortRef.current = [...shortResults];
  }, [longResults, shortResults, longPassedCount, shortPassedCount, buildEntrySignal]);

  // Helper to render a condition block
  const renderConditionBlock = (
    title: string,
    icon: React.ReactNode,
    conditions: ScalpCondition[],
    results: boolean[],
    passedCount: number,
    colorClass: string,
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          {icon}
          <span className={colorClass}>{title}</span>
        </span>
        <span className={`font-mono text-xs font-bold ${passedCount === 7 ? "text-bull" : passedCount >= 5 ? "text-yellow-400" : "text-bear"}`}>
          {passedCount}/7
        </span>
      </div>
      {conditions.map((c, idx) => {
        const passed = results[idx];
        const isBlocker = !passed && passedCount >= 5; // highlight blockers when close to signal
        return (
          <div
            key={c.label}
            className={`flex items-center gap-2 text-xs py-0.5 px-2 rounded ${isBlocker ? "bg-bear/10 border border-bear/20" : ""}`}
          >
            {passed ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-bull shrink-0" />
            ) : (
              <XCircle className={`h-3.5 w-3.5 shrink-0 ${isBlocker ? "text-bear" : "text-muted-foreground/40"}`} />
            )}
            <span className={`font-mono ${passed ? "text-foreground" : isBlocker ? "text-bear" : "text-muted-foreground"}`}>
              {c.label}
            </span>
          </div>
        );
      })}
    </div>
  );

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
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-xs gap-1.5"
          onClick={() => {
            playEntryAlert();
            const sig = buildEntrySignal("long", true);
            if (sig) {
              setEntrySignal(sig);
              setIsTestEntry(true);
              setEntryHubOpen(true);
              sendEntryPushNotification({
                symbol: sig.symbol,
                direction: sig.direction,
                score: sig.score,
                passedConditions: sig.passedConditions,
                totalConditions: sig.totalConditions,
                entryPrice: sig.entryPrice,
                stopPrice: sig.stopPrice,
                targetPrice: sig.target1Price,
                strategyName: sig.strategyName,
              });
            }
          }}
        >
          <Volume2 className="h-3.5 w-3.5" />
          Testar Alerta
        </Button>
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

          {/* Indicator values */}
          {!isNaN(scalp.ema9) && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Indicadores (ao vivo)</h3>
              <div className="space-y-1.5 text-xs">
                {[
                  ["EMA 9", scalp.ema9],
                  ["EMA 21", scalp.ema21],
                  ["EMA 200", scalp.ema200],
                  ["RSI 14", scalp.rsi],
                  ["Close", scalp.close],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground font-mono">{label}</span>
                    <span className="font-mono text-foreground">
                      {label === "RSI 14" ? (val as number).toFixed(2) : `$${(val as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== SCALP CONDITIONS — LONG & SHORT ===== */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Condições Scalp (ao vivo)</h3>

            {isNaN(scalp.ema9) ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Aguardando dados (precisa de 200+ candles)...
              </p>
            ) : (
              <div className="space-y-4">
                {renderConditionBlock(
                  "LONG",
                  <TrendingUp className="h-3.5 w-3.5 text-bull" />,
                  LONG_CONDITIONS,
                  longResults,
                  longPassedCount,
                  "text-bull",
                )}

                <div className="border-t border-border" />

                {renderConditionBlock(
                  "SHORT",
                  <TrendingDown className="h-3.5 w-3.5 text-bear" />,
                  SHORT_CONDITIONS,
                  shortResults,
                  shortPassedCount,
                  "text-bear",
                )}

                {/* Signal alert */}
                {longPassedCount === 7 && (
                  <div className="rounded bg-bull/10 border border-bull/20 px-3 py-2 text-center">
                    <span className="text-xs font-bold text-bull">🎯 SINAL LONG — 7/7 condições ✓</span>
                  </div>
                )}
                {shortPassedCount === 7 && (
                  <div className="rounded bg-bear/10 border border-bear/20 px-3 py-2 text-center">
                    <span className="text-xs font-bold text-bear">🎯 SINAL SHORT — 7/7 condições ✓</span>
                  </div>
                )}
                {longPassedCount < 7 && shortPassedCount < 7 && (longPassedCount > 0 || shortPassedCount > 0) && (
                  <div className="rounded bg-muted/30 px-3 py-2 text-center">
                    <span className="text-[10px] text-muted-foreground">
                      Sem alinhamento completo — aguardando 7/7
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Strategy indicators list (from selected strategy) */}
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

      {/* Entry Hub Modal */}
      <EntryHubModal
        open={entryHubOpen}
        onOpenChange={setEntryHubOpen}
        signal={entrySignal}
        isTest={isTestEntry}
      />
    </div>
  );
}