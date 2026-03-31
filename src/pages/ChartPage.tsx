import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TradingViewChart } from "@/components/chart/TradingViewChart";
import { useTickers, useOpenInterest, useFundingRate } from "@/hooks/use-bybit";
import { useStrategies } from "@/hooks/use-strategies";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Puzzle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { BybitCategory } from "@/services/bybit";

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

  const ticker = tickers?.[0];
  const latestOI = oiData?.[0];
  const latestFunding = fundingData?.[0];

  const activeStrategy = strategies?.find((s) => s.id === selectedStrategyId);
  const activeStrategies = strategies?.filter((s) => s.active) || [];

  const setSymbol = (s: string) => {
    setSearchParams({ symbol: s, category, tf: timeframe });
  };

  // Get indicators from selected strategy
  const chartIndicators = activeStrategy?.indicators
    ?.filter((i) => i.enabled && i.plot_on_chart)
    ?.map((i) => ({
      indicator_type: i.indicator_type,
      params: i.params as Record<string, unknown> | null,
      enabled: i.enabled,
      plot_on_chart: i.plot_on_chart,
    })) || [];

  // Conditions from strategy for checklist
  const conditions = activeStrategy?.conditions || [];

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

          {/* Conditions checklist */}
          {activeStrategy && conditions.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Condições</h3>
              <div className="space-y-1.5">
                {conditions.map((c) => {
                  const indicator = activeStrategy.indicators.find((i) => i.id === c.indicator_id);
                  const indName = indicator
                    ? indicator.indicator_type.toUpperCase()
                    : c.condition_type;

                  // Format value for display
                  const val = c.value as unknown;
                  let valueStr = "";
                  if (val && typeof val === "object" && "min" in (val as any) && "max" in (val as any)) {
                    valueStr = `${(val as any).min} e ${(val as any).max}`;
                  } else if (typeof val === "object") {
                    valueStr = Object.values(val as any).join(", ");
                  } else {
                    valueStr = String(val ?? "");
                  }

                  // Readable operator
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

                  return (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-foreground">
                        {indName} {opStr} {valueStr}
                      </span>
                      {c.role === "required" && (
                        <Badge variant="outline" className="ml-auto text-[8px] px-1">Obrig.</Badge>
                      )}
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
    </div>
  );
}
