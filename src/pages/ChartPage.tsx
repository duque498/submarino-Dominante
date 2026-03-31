import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { CheckCircle2, XCircle, TrendingUp, ChevronDown } from "lucide-react";

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
  const [timeframe, setTimeframe] = useState("5m");
  const timeframes = ["1m", "5m", "15m", "1h", "4h"];

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-mono text-foreground">BTCUSDT</h1>
          <Badge variant="bull">
            <TrendingUp className="mr-1 h-3 w-3" /> Compra
          </Badge>
          <ScoreBadge score={74} showLabel />
        </div>
        <div className="flex gap-1">
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
        {/* Chart placeholder */}
        <div className="flex aspect-[16/9] items-center justify-center rounded-lg border border-border bg-card">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Gráfico de candles</p>
            <p className="mt-1 text-xs">Integração com lightweight-charts na Fase 2</p>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Signal Info */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Dados do Sinal</h3>
            <div className="space-y-2 text-xs">
              {[
                ["Entrada", "$67,432.50"],
                ["Stop", "$66,890.00"],
                ["Alvo 1", "$68,200.00"],
                ["Alvo 2", "$69,100.00"],
                ["R/R", "2.1"],
                ["Volume 24h", "$1.2B"],
                ["Spread", "0.02%"],
                ["Open Interest", "+2.3%"],
                ["Funding", "0.0045%"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Score por Bloco</h3>
            <div className="space-y-2">
              {mockScoreBreakdown.map((block) => {
                const weighted = Math.round((block.score * block.weight) / 100);
                return (
                  <div key={block.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{block.label} ({block.weight}%)</span>
                      <span className="font-mono text-foreground">{block.score}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${block.score}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Checklist de Filtros</h3>
            <div className="space-y-1.5">
              {mockFilters.map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-xs">
                  {f.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-bull" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0 text-bear" />
                  )}
                  <span className={f.passed ? "text-foreground" : "text-muted-foreground"}>
                    {f.label}
                  </span>
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
