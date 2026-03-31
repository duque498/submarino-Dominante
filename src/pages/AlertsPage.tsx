import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Bell, Check, Eye, Filter, TrendingUp, TrendingDown } from "lucide-react";
import { useState } from "react";

const mockAlerts = [
  { id: "1", symbol: "BTCUSDT", direction: "buy" as const, score: 74, strategy: "Rompimento com Confluência", timeframe: "5m", status: "sent", time: "14:32", channel: "Telegram" },
  { id: "2", symbol: "ETHUSDT", direction: "buy" as const, score: 68, strategy: "Rompimento com Confluência", timeframe: "15m", status: "pending", time: "14:28", channel: "In-App" },
  { id: "3", symbol: "SOLUSDT", direction: "sell" as const, score: 62, strategy: "Rompimento com Confluência", timeframe: "1h", status: "read", time: "13:45", channel: "Telegram" },
];

export default function AlertsPage() {
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "read">("all");

  const filtered = filter === "all" ? mockAlerts : mockAlerts.filter((a) => a.status === filter);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas</h1>
          <p className="text-sm text-muted-foreground">Notificações e sinais enviados</p>
        </div>
      </div>

      <div className="flex gap-1">
        {(["all", "pending", "sent", "read"] as const).map((f) => (
          <Button key={f} variant={filter === f ? "default" : "secondary"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "Todos" : f === "pending" ? "Pendentes" : f === "sent" ? "Enviados" : "Lidos"}
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((alert) => (
          <div key={alert.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <ScoreBadge score={alert.score} size="sm" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-foreground">{alert.symbol}</span>
                  <Badge variant={alert.direction === "buy" ? "bull" : "bear"}>
                    {alert.direction === "buy" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">{alert.timeframe}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{alert.strategy}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{alert.channel}</span>
              <span className="font-mono">{alert.time}</span>
              <Badge variant={alert.status === "pending" ? "neutral" : alert.status === "sent" ? "default" : "secondary"} className="text-[10px]">
                {alert.status === "pending" ? "Pendente" : alert.status === "sent" ? "Enviado" : "Lido"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
