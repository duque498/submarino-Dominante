import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useBybitConnection } from "@/hooks/use-bybit-connection";
import { useTickers } from "@/hooks/use-bybit";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  Clock,
  Target,
  Loader2,
  LineChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const mockTopSignals = [
  { symbol: "BTCUSDT", direction: "buy" as const, score: 74, strategy: "Rompimento com Confluência", timeframe: "5m", rr: "2.1" },
  { symbol: "ETHUSDT", direction: "buy" as const, score: 68, strategy: "Rompimento com Confluência", timeframe: "15m", rr: "1.9" },
  { symbol: "SOLUSDT", direction: "sell" as const, score: 62, strategy: "Rompimento com Confluência", timeframe: "1h", rr: "2.3" },
];

export default function DashboardPage() {
  const connection = useBybitConnection();
  const { data: tickers, isLoading } = useTickers("linear");
  const navigate = useNavigate();

  // Get prices for the top signals
  const tickerMap = new Map((tickers || []).map((t) => [t.symbol, t]));

  const lastSyncText = connection.lastSync
    ? `${Math.round((Date.now() - connection.lastSync) / 1000)}s atrás`
    : "—";

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do mercado e oportunidades</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sinais Hoje", value: "—", icon: Zap, change: "Fase 3" },
          { label: "Score Médio", value: "—", icon: Target, change: "Fase 3" },
          { label: "Ativos Monitorados", value: tickers ? String(Math.min(tickers.length, 50)) : "...", icon: BarChart3 },
          { label: "Latência", value: connection.latency ? `${connection.latency}ms` : "—", icon: Clock },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{stat.value}</span>
              {stat.change && <span className="text-xs text-muted-foreground">{stat.change}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* System Status */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Status do Sistema</h2>
        <div className="flex flex-wrap gap-6">
          <StatusIndicator status={connection.connected ? "online" : "offline"} label={connection.connected ? "Bybit Conectada" : "Bybit Desconectada"} />
          <StatusIndicator status="warning" label="Scanner: Fase 3" />
          <StatusIndicator status={connection.connected ? "online" : "loading"} label={`Última sync: ${lastSyncText}`} />
          <StatusIndicator
            status={connection.latency && connection.latency < 200 ? "online" : connection.latency ? "warning" : "loading"}
            label={`Latência: ${connection.latency ? `${connection.latency}ms` : "—"}`}
          />
        </div>
      </div>

      {/* Top Movers from real data */}
      {tickers && tickers.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Top Movers (24h)</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...tickers]
              .filter((t) => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT"].includes(t.symbol))
              .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
              .slice(0, 6)
              .map((t) => (
                <button
                  key={t.symbol}
                  onClick={() => navigate(`/grafico?symbol=${t.symbol}&category=linear`)}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div>
                    <span className="font-mono font-semibold text-foreground">{t.symbol.replace("USDT", "")}</span>
                    <p className="mt-0.5 text-xs font-mono text-muted-foreground">${t.lastPrice.toLocaleString()}</p>
                  </div>
                  <Badge variant={t.change24h >= 0 ? "bull" : "bear"}>
                    {t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(2)}%
                  </Badge>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Signals (mock until Phase 3) */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Melhores Oportunidades</h2>
        <div className="space-y-2">
          {mockTopSignals.map((signal) => {
            const t = tickerMap.get(signal.symbol);
            return (
              <button
                key={`${signal.symbol}-${signal.timeframe}`}
                onClick={() => navigate(`/grafico?symbol=${signal.symbol}&category=linear&tf=${signal.timeframe}`)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center gap-4">
                  <ScoreBadge score={signal.score} size="md" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{signal.symbol}</span>
                      <Badge variant={signal.direction === "buy" ? "bull" : "bear"}>
                        {signal.direction === "buy" ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                        {signal.direction === "buy" ? "Compra" : "Venda"}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">{signal.timeframe}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{signal.strategy}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-foreground">
                    {t ? `$${t.lastPrice.toLocaleString()}` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">R/R: {signal.rr}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
