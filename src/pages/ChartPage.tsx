import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { TradingChart } from "@/components/chart/TradingChart";
import { useKlines, useTickers, useOrderbook, useOpenInterest, useFundingRate } from "@/hooks/use-bybit";
import { CheckCircle2, XCircle, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { BybitCategory } from "@/services/bybit";

const mockScoreBreakdown = [
  { label: "Backtest / Histórico", weight: 30, score: 78 },
  { label: "Confluência de Indicadores", weight: 20, score: 85 },
  { label: "Volume e Liquidez", weight: 15, score: 72 },
  { label: "Spread e Execução", weight: 10, score: 60 },
  { label: "Tendência TF Maior", weight: 10, score: 65 },
  { label: "Risco / Retorno", weight: 10, score: 80 },
  { label: "Derivativos (OI/Funding)", weight: 5, score: 55 },
];

const mockFilters = [
  { label: "EMA 9 > EMA 21", passed: true, required: true },
  { label: "RSI entre 55 e 70", passed: true, required: true },
  { label: "Volume > 1.5x média", passed: true, required: true },
  { label: "Preço acima VWAP", passed: true, required: true },
  { label: "Spread < 0.05%", passed: true, required: true },
  { label: "R/R >= 1.8", passed: true, required: true },
  { label: "OI crescente", passed: false, required: false },
  { label: "Funding neutro", passed: true, required: false },
];

export default function ChartPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const category = (searchParams.get("category") || "linear") as BybitCategory;
  const [timeframe, setTimeframe] = useState(searchParams.get("tf") || "5m");
  const timeframes = ["1m", "5m", "15m", "1h", "4h"];

  const { data: candles, isLoading: loadingCandles } = useKlines(symbol, timeframe, category);
  const { data: tickers } = useTickers(category, symbol);
  const { data: oiData } = useOpenInterest(symbol, category);
  const { data: fundingData } = useFundingRate(symbol, category);

  const ticker = tickers?.[0];
  const latestOI = oiData?.[0];
  const latestFunding = fundingData?.[0];

  const setSymbol = (s: string) => {
    setSearchParams({ symbol: s, category, tf: timeframe });
  };

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
        <div className="flex items-center gap-1">
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

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Chart */}
        <div>
          {loadingCandles ? (
            <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-border bg-card">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : candles && candles.length > 0 ? (
            <TradingChart
              candles={candles}
              symbol={symbol}
              timeframe={timeframe}
              category={category}
              height={520}
            />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
              Sem dados disponíveis
            </div>
          )}
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

          {/* Score Breakdown (mock for now) */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Score por Bloco</h3>
            <div className="space-y-2">
              {mockScoreBreakdown.map((block) => (
                <div key={block.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{block.label} ({block.weight}%)</span>
                    <span className="font-mono text-foreground">{block.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${block.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Checklist de Filtros</h3>
            <div className="space-y-1.5">
              {mockFilters.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  {f.passed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-bull" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-bear" />}
                  <span className={f.passed ? "text-foreground" : "text-muted-foreground"}>{f.label}</span>
                  {f.required && <Badge variant="outline" className="ml-auto text-[8px] px-1">Obrig.</Badge>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
