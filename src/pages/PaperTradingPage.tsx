import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Play, Pause, TrendingUp, TrendingDown } from "lucide-react";

const mockPaperTrades = [
  { id: "1", symbol: "BTCUSDT", direction: "buy" as const, entry: "67,432.50", stop: "66,890.00", target: "68,200.00", score: 74, status: "open", pnl: "+0.8%", time: "14:32" },
  { id: "2", symbol: "ETHUSDT", direction: "sell" as const, entry: "3,521.80", stop: "3,580.00", target: "3,400.00", score: 68, status: "closed", pnl: "+1.2%", time: "12:15" },
];

export default function PaperTradingPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Paper Trading</h1>
          <p className="text-sm text-muted-foreground">Simulação de operações para validar estratégias</p>
        </div>
        <Badge variant="neutral">Modo Simulação</Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Posições Abertas", value: "1" },
          { label: "Total Simulado", value: "8" },
          { label: "Win Rate", value: "71%" },
          { label: "P&L Simulado", value: "+5.2%" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <div className="mt-1 text-xl font-bold font-mono text-foreground">{m.value}</div>
          </div>
        ))}
      </div>

      {/* Trades */}
      <div className="space-y-2">
        {mockPaperTrades.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-4">
              <ScoreBadge score={t.score} size="sm" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-foreground">{t.symbol}</span>
                  <Badge variant={t.direction === "buy" ? "bull" : "bear"}>
                    {t.direction === "buy" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  </Badge>
                  <Badge variant={t.status === "open" ? "default" : "secondary"} className="text-[10px]">
                    {t.status === "open" ? "Aberta" : "Fechada"}
                  </Badge>
                </div>
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground font-mono">
                  <span>E: ${t.entry}</span>
                  <span>S: ${t.stop}</span>
                  <span>T: ${t.target}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-mono font-bold ${t.pnl.startsWith("+") ? "text-bull" : "text-bear"}`}>{t.pnl}</div>
              <span className="text-xs text-muted-foreground">{t.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
