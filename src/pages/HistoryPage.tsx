import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, MinusCircle } from "lucide-react";

const mockHistory = [
  { id: "1", symbol: "BTCUSDT", direction: "buy" as const, score: 74, time: "2025-03-30 14:32", result: "win", pnl: "+2.1%", strategy: "Rompimento com Confluência", timeframe: "5m" },
  { id: "2", symbol: "ETHUSDT", direction: "buy" as const, score: 68, time: "2025-03-30 12:15", result: "loss", pnl: "-0.8%", strategy: "Rompimento com Confluência", timeframe: "15m" },
  { id: "3", symbol: "SOLUSDT", direction: "sell" as const, score: 62, time: "2025-03-29 09:45", result: "no_trigger", pnl: "-", strategy: "Rompimento com Confluência", timeframe: "1h" },
  { id: "4", symbol: "BTCUSDT", direction: "buy" as const, score: 71, time: "2025-03-29 08:20", result: "win", pnl: "+1.5%", strategy: "Rompimento com Confluência", timeframe: "5m" },
];

const ResultIcon = ({ result }: { result: string }) => {
  if (result === "win") return <CheckCircle2 className="h-4 w-4 text-bull" />;
  if (result === "loss") return <XCircle className="h-4 w-4 text-bear" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground" />;
};

export default function HistoryPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Histórico de Sinais</h1>
        <p className="text-sm text-muted-foreground">Todos os sinais gerados e seus resultados</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border -mx-3 md:mx-0">
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-2 md:px-4 py-2 md:py-3 text-left font-medium text-muted-foreground">Data</th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-left font-medium text-muted-foreground">Ativo</th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-left font-medium text-muted-foreground">Dir.</th>
              <th className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-left font-medium text-muted-foreground">TF</th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-center font-medium text-muted-foreground">Score</th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-center font-medium text-muted-foreground">Res.</th>
              <th className="px-2 md:px-4 py-2 md:py-3 text-right font-medium text-muted-foreground">P&L</th>
            </tr>
          </thead>
          <tbody>
            {mockHistory.map((s) => (
              <tr key={s.id} className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.time}</td>
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{s.symbol}</td>
                <td className="px-4 py-3">
                  <Badge variant={s.direction === "buy" ? "bull" : "bear"} className="text-[10px]">
                    {s.direction === "buy" ? "C" : "V"}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.timeframe}</td>
                <td className="px-4 py-3 text-center"><ScoreBadge score={s.score} size="sm" /></td>
                <td className="px-4 py-3 text-center"><ResultIcon result={s.result} /></td>
                <td className={`px-4 py-3 text-right font-mono ${s.pnl.startsWith("+") ? "text-bull" : s.pnl.startsWith("-") && s.pnl !== "-" ? "text-bear" : "text-muted-foreground"}`}>
                  {s.pnl}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
