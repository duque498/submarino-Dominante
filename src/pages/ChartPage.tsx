import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradingViewChart } from "@/components/chart/TradingViewChart";
import { EntryHubModal, type EntrySignalData } from "@/components/chart/EntryHubModal";
import { LiveConditionsPanel } from "@/components/chart/LiveConditionsPanel";
import { useTickers, useKlines, useOpenInterest, useFundingRate } from "@/hooks/use-bybit";
import { useStrategies } from "@/hooks/use-strategies";
import { TrendingUp, TrendingDown, Puzzle, Volume2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { playConditionTick, playEntryAlert, sendEntryPushNotification } from "@/lib/audio-notifications";
import { toast } from "sonner";
import {
  parseConditions,
  evaluateConditions,
  summarizeDirection,
  filterConditionsByDirection,
  resolveIndicatorValue,
  calcATR,
  getPrice,
  type MarketContext,
  type ParsedCondition,
} from "@/lib/condition-evaluator";
import type { BybitCategory, CandleData, TickerData } from "@/services/bybit";

export default function ChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const category = (searchParams.get("category") || "linear") as BybitCategory;
  const [timeframe, setTimeframe] = useState(searchParams.get("tf") || "5m");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>("none");
  const [entryHubOpen, setEntryHubOpen] = useState(false);
  const [entrySignal, setEntrySignal] = useState<EntrySignalData | null>(null);
  const [isTestEntry, setIsTestEntry] = useState(false);
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

  // ─── Market Context (single source of truth) ─────────────────────
  const marketCtx: MarketContext = useMemo(() => ({
    candles: candles || [],
    ticker: ticker || null,
    openInterest: latestOI?.openInterest ?? null,
    fundingRate: latestFunding?.fundingRate ?? null,
  }), [candles, ticker, latestOI, latestFunding]);

  // ─── Chart indicators ────────────────────────────────────────────
  const chartIndicators = activeStrategy?.indicators
    ?.filter((i) => i.enabled)
    ?.map((i) => ({
      indicator_type: i.indicator_type,
      params: i.params as Record<string, unknown> | null,
      enabled: i.enabled,
      plot_on_chart: i.plot_on_chart,
    })) || [];

  // ─── Parsed conditions from strategy ──────────────────────────────
  const parsed = useMemo(() => {
    if (!activeStrategy) return [];
    return parseConditions(activeStrategy.conditions || [], activeStrategy.indicators || [], activeStrategy.direction);
  }, [activeStrategy]);

  const longParsed = useMemo(() => filterConditionsByDirection(parsed, "long"), [parsed]);
  const shortParsed = useMemo(() => filterConditionsByDirection(parsed, "short"), [parsed]);

  const longResults = useMemo(
    () => evaluateConditions(longParsed, marketCtx, "long"),
    [longParsed, marketCtx]
  );
  const shortResults = useMemo(
    () => evaluateConditions(shortParsed, marketCtx, "short"),
    [shortParsed, marketCtx]
  );
  const longSummary = useMemo(
    () => summarizeDirection(longParsed, longResults, "long"),
    [longParsed, longResults]
  );
  const shortSummary = useMemo(
    () => summarizeDirection(shortParsed, shortResults, "short"),
    [shortParsed, shortResults]
  );

  const bestDirection = longSummary.passed >= shortSummary.passed ? "long" : "short";
  const bestSummary = bestDirection === "long" ? longSummary : shortSummary;

  // ─── Build entry signal for hub modal ─────────────────────────────
  const buildEntrySignal = useCallback((dir: "long" | "short", test = false): EntrySignalData | null => {
    if (!candles || candles.length < 20) return null;
    const price = candles[candles.length - 1].close;
    const atr = calcATR(candles, 14);
    const atrVal = isNaN(atr) ? price * 0.01 : atr;
    const isLong = dir === "long";
    const stopDist = atrVal * 1.5;
    const entry = price;
    const stop = isLong ? price - stopDist : price + stopDist;
    const tp1 = isLong ? price + stopDist * 1.5 : price - stopDist * 1.5;
    const tp2 = isLong ? price + stopDist * 2.5 : price - stopDist * 2.5;
    const rr = stopDist > 0 ? Math.abs(tp1 - entry) / stopDist : 0;

    const results = dir === "long" ? longResults : shortResults;
    const summary = dir === "long" ? longSummary : shortSummary;

    const directionParsed = dir === "long" ? longParsed : shortParsed;
    const condDetails = directionParsed.map((pc) => {
      const r = results.find((res) => res.conditionId === pc.id);
      return { name: r?.effectiveLabel || pc.label, passed: r?.passed ?? false };
    });

    const indSnap: Record<string, number | null> = {};
    activeStrategy?.indicators.forEach((ind) => {
      const v = resolveIndicatorValue(ind.indicator_type, ind.params as any, marketCtx);
      indSnap[ind.indicator_type] = v;
    });

    return {
      symbol,
      direction: dir,
      strategyName: activeStrategy?.name || (test ? "Estratégia Teste" : "—"),
      score: summary.total > 0 ? Math.round(summary.ratio * 100) : (test ? 78 : 0),
      totalConditions: summary.total || (test ? 5 : 0),
      passedConditions: summary.passed || (test ? 4 : 0),
      entryPrice: entry,
      stopPrice: stop,
      target1Price: tp1,
      target2Price: tp2,
      rrRatio: rr,
      timeframe,
      market: category,
      conditionDetails: condDetails.length > 0 ? condDetails : (test ? [
        { name: "EMA(9) > EMA(21)", passed: true },
        { name: "RSI(14) > 55", passed: true },
        { name: "Vol/Média(20) > 1.5x", passed: true },
        { name: "Preço > VWAP", passed: true },
        { name: "ADX(14) > 25", passed: false },
      ] : []),
      indicatorSnapshot: indSnap,
    };
  }, [candles, longParsed, shortParsed, longResults, shortResults, longSummary, shortSummary, activeStrategy, symbol, timeframe, category, marketCtx]);

  // ─── Sound/alert triggers ─────────────────────────────────────────
  const prevLongRef = useRef<boolean[]>([]);
  const prevShortRef = useRef<boolean[]>([]);
  const entryAlertFiredRef = useRef(false);

  useEffect(() => {
    const longBools = longResults.map((r) => r.passed);
    const shortBools = shortResults.map((r) => r.passed);

    // Tick sound when any condition newly passes
    if (prevLongRef.current.length === longBools.length) {
      for (let i = 0; i < longBools.length; i++) {
        if ((longBools[i] && !prevLongRef.current[i]) || (shortBools[i] && !prevShortRef.current[i])) {
          playConditionTick();
          break;
        }
      }
    }

    // Alert when ALL conditions are met (100%)
    const triggered = longSummary.status === "confirmed" || shortSummary.status === "confirmed";
    if (triggered && !entryAlertFiredRef.current) {
      entryAlertFiredRef.current = true;
      playEntryAlert();
      const dir = longSummary.status === "confirmed" ? "long" : "short";
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
    } else if (!triggered) {
      entryAlertFiredRef.current = false;
    }

    prevLongRef.current = longBools;
    prevShortRef.current = shortBools;
  }, [longResults, shortResults, longSummary, shortSummary, buildEntrySignal]);

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
            <Button key={s} variant={symbol === s ? "default" : "ghost"} size="sm" className="font-mono text-xs" onClick={() => setSymbol(s)}>
              {s.replace("USDT", "")}
            </Button>
          ))}
          <div className="mx-2 h-4 w-px bg-border" />
          {timeframes.map((tf) => (
            <Button key={tf} variant={timeframe === tf ? "default" : "secondary"} size="sm" className="font-mono text-xs" onClick={() => setTimeframe(tf)}>
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
                {s.name} ({s.indicators.length} ind, {s.conditions.length} cond)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeStrategy && (
          <Badge variant="outline" className="text-[10px]">
            {activeStrategy.indicators.filter((i) => i.enabled).length} indicadores · {activeStrategy.conditions.length} condições
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
                    const liveValue = resolveIndicatorValue(ind.indicator_type, params, marketCtx);
                    return (
                      <div key={ind.id} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${ind.plot_on_chart ? "bg-primary" : "bg-muted"}`} />
                          <span className="text-foreground font-mono">
                            {ind.indicator_type.toUpperCase()}
                            {paramStr && ` (${paramStr})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {liveValue != null && !isNaN(liveValue) && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {Math.abs(liveValue) > 100 ? liveValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) : liveValue.toFixed(2)}
                            </span>
                          )}
                          <Badge variant="outline" className="text-[8px] px-1">
                            {ind.role}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Live Conditions Panel — dynamic from strategy */}
          {activeStrategy && (
            <LiveConditionsPanel
              strategy={activeStrategy}
              symbol={symbol}
              timeframe={timeframe}
              ctx={marketCtx}
            />
          )}

          {/* No strategy selected */}
          {!activeStrategy && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Puzzle className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">
                Selecione uma estratégia para monitorar condições ao vivo
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
