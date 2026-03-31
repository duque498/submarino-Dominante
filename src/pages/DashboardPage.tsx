import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { useBybitConnection } from "@/hooks/use-bybit-connection";
import { useTickers } from "@/hooks/use-bybit";
import { useSignals } from "@/hooks/use-signals";
import { useStrategies } from "@/hooks/use-strategies";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Zap,
  Clock,
  Target,
  Activity,
  Radar,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function DashboardPage() {
  const { session } = useAuth();
  const connection = useBybitConnection();
  const { data: tickers } = useTickers("linear");
  const { data: signals } = useSignals(100);
  const { data: strategies } = useStrategies();
  const navigate = useNavigate();

  // Signals today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const signalsToday = (signals || []).filter(s => new Date(s.created_at) >= todayStart);
  const avgScore = signalsToday.length > 0
    ? Math.round(signalsToday.reduce((a, s) => a + s.score, 0) / signalsToday.length)
    : 0;

  // Active strategies
  const activeStrategies = (strategies || []).filter(s => s.active);

  // Last signal as proxy for "last scan"
  const lastSignal = signals && signals.length > 0 ? signals[0] : null;
  const lastScanText = lastSignal
    ? formatDistanceToNow(new Date(lastSignal.created_at), { addSuffix: true, locale: ptBR })
    : "Nenhum sinal ainda";

  // Alerts pending
  const { data: pendingAlerts } = useQuery({
    queryKey: ["pending-alerts-count", session?.user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session?.user?.id,
    refetchInterval: 10000,
  });

  // Signals by strategy
  const signalsByStrategy = new Map<string, number>();
  signalsToday.forEach(s => {
    if (s.strategy_id) {
      signalsByStrategy.set(s.strategy_id, (signalsByStrategy.get(s.strategy_id) || 0) + 1);
    }
  });

  // Ticker map
  const tickerMap = new Map((tickers || []).map(t => [t.symbol, t]));

  const lastSyncText = connection.lastSync
    ? `${Math.round((Date.now() - connection.lastSync) / 1000)}s atrás`
    : "—";

  // Top signals (recent high-score)
  const topSignals = (signals || []).slice(0, 5);

  return (
    <div className="space-y-4 md:space-y-6 animate-slide-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs md:text-sm text-muted-foreground truncate">Monitoramento do scanner em tempo real</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 md:px-3 md:py-1.5 shrink-0">
          <Radar className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary animate-pulse" />
          <span className="text-[10px] md:text-xs font-mono text-muted-foreground hidden sm:inline">Scanner ativo</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Sinais Hoje", value: String(signalsToday.length), icon: Zap, accent: signalsToday.length > 0 ? "text-chart-green" : "" },
          { label: "Score Médio", value: avgScore > 0 ? `${avgScore}%` : "—", icon: Target, accent: avgScore >= 70 ? "text-chart-green" : avgScore >= 50 ? "text-chart-yellow" : "" },
          { label: "Estratégias Ativas", value: String(activeStrategies.length), icon: ShieldCheck },
          { label: "Alertas Pendentes", value: String(pendingAlerts ?? 0), icon: AlertTriangle, accent: (pendingAlerts ?? 0) > 0 ? "text-chart-yellow" : "" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-3 md:p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] md:text-xs text-muted-foreground">{stat.label}</span>
              <stat.icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${stat.accent || "text-muted-foreground"}`} />
            </div>
            <div className="mt-1 md:mt-2">
              <span className={`text-lg md:text-2xl font-bold font-mono ${stat.accent || "text-foreground"}`}>{stat.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Scanner Status */}
      <div className="rounded-lg border border-border bg-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <h2 className="text-xs md:text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Status do Scanner
          </h2>
          <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground">Auto-scan 2 min</span>
        </div>
        <div className="flex flex-wrap gap-3 md:gap-6">
          <StatusIndicator status={connection.connected ? "online" : "offline"} label={connection.connected ? "Bybit Conectada" : "Bybit Desconectada"} />
          <StatusIndicator status={activeStrategies.length > 0 ? "online" : "warning"} label={`${activeStrategies.length} estratégia(s) ativa(s)`} />
          <StatusIndicator status={signalsToday.length > 0 ? "online" : "loading"} label={`Último sinal: ${lastScanText}`} />
          <StatusIndicator
            status={connection.latency && connection.latency < 200 ? "online" : connection.latency ? "warning" : "loading"}
            label={`Latência: ${connection.latency ? `${connection.latency}ms` : "—"}`}
          />
        </div>
      </div>

      {/* Strategy Performance Grid */}
      {activeStrategies.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Estratégias Monitoradas</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeStrategies.map(s => {
              const count = signalsByStrategy.get(s.id) || 0;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate("/estrategias")}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-foreground truncate block">{s.name}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px]">{s.market}</Badge>
                      <Badge variant="outline" className="text-[10px]">{s.direction}</Badge>
                      <span className="text-[10px] text-muted-foreground">Score mín: {s.score_min}%</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="font-mono text-lg font-bold text-foreground">{count}</div>
                    <div className="text-[10px] text-muted-foreground">sinais hoje</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Movers */}
      {tickers && tickers.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Top Movers (24h)</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...tickers]
              .filter(t => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT"].includes(t.symbol))
              .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
              .slice(0, 6)
              .map(t => (
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

      {/* Recent Signals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">Últimos Sinais Gerados</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/alertas")} className="text-xs">
            Ver todos →
          </Button>
        </div>
        {topSignals.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
            <Radar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum sinal gerado ainda</p>
            <p className="text-xs text-muted-foreground mt-1">O scanner avalia suas estratégias ativas a cada 2 minutos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topSignals.map(signal => {
              const t = tickerMap.get(signal.symbol);
              const stratName = strategies?.find(s => s.id === signal.strategy_id)?.name || "—";
              return (
                <button
                  key={signal.id}
                  onClick={() => navigate(`/grafico?symbol=${signal.symbol}&category=linear&tf=${signal.timeframe}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={signal.score} size="md" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-foreground">{signal.symbol}</span>
                        <Badge variant={signal.direction === "long" ? "bull" : "bear"}>
                          {signal.direction === "long" ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                          {signal.direction === "long" ? "Compra" : "Venda"}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">{signal.timeframe}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{stratName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-foreground">
                      {signal.entry_price ? `$${Number(signal.entry_price).toLocaleString()}` : t ? `$${t.lastPrice.toLocaleString()}` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      R/R: {signal.rr_ratio ? Number(signal.rr_ratio).toFixed(1) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(new Date(signal.created_at), "HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
