import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  Clock,
  Target,
} from "lucide-react";

const mockTopSignals = [
  { symbol: "BTCUSDT", direction: "buy" as const, score: 74, strategy: "Rompimento com Confluência", timeframe: "5m", rr: "2.1", price: "67,432.50" },
  { symbol: "ETHUSDT", direction: "buy" as const, score: 68, strategy: "Rompimento com Confluência", timeframe: "15m", rr: "1.9", price: "3,521.80" },
  { symbol: "SOLUSDT", direction: "sell" as const, score: 62, strategy: "Rompimento com Confluência", timeframe: "1h", rr: "2.3", price: "142.65" },
];

const mockStats = [
  { label: "Sinais Hoje", value: "12", icon: Zap, change: "+3" },
  { label: "Score Médio", value: "67", icon: Target, change: "+2.4" },
  { label: "Ativos Monitorados", value: "3", icon: BarChart3 },
  { label: "Última Análise", value: "12s", icon: Clock },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do mercado e oportunidades</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {mockStats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-foreground">{stat.value}</span>
              {stat.change && (
                <span className="text-xs text-bull">
                  {stat.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* System Status */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Status do Sistema</h2>
        <div className="flex flex-wrap gap-6">
          <StatusIndicator status="online" label="Bybit Conectada" />
          <StatusIndicator status="online" label="Scanner Ativo" />
          <StatusIndicator status="online" label="Última sync: 12s atrás" />
          <StatusIndicator status="warning" label="Latência: 145ms" />
        </div>
      </div>

      {/* Top Signals */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Melhores Oportunidades</h2>
        <div className="space-y-2">
          {mockTopSignals.map((signal) => (
            <div
              key={`${signal.symbol}-${signal.timeframe}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-4">
                <ScoreBadge score={signal.score} size="md" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground">{signal.symbol}</span>
                    <Badge variant={signal.direction === "buy" ? "bull" : "bear"}>
                      {signal.direction === "buy" ? (
                        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Compra</span>
                      ) : (
                        <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Venda</span>
                      )}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[10px]">{signal.timeframe}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{signal.strategy}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm text-foreground">${signal.price}</div>
                <div className="text-xs text-muted-foreground">R/R: {signal.rr}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
