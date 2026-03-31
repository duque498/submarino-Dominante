import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Play, Pause, Copy, Pencil, Trash2 } from "lucide-react";

const mockStrategies = [
  {
    id: "1",
    name: "Rompimento com Confluência",
    description: "Busca rompimentos com múltiplos indicadores confirmando",
    market: "Linear Perp",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
    timeframes: ["5m", "15m"],
    scoreMin: 60,
    active: true,
    signals: 42,
    winRate: 68,
  },
];

export default function StrategiesPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estratégias</h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie suas estratégias de análise</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Nova Estratégia
        </Button>
      </div>

      <div className="space-y-3">
        {mockStrategies.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                  <Badge variant={s.active ? "bull" : "secondary"}>
                    {s.active ? "Ativa" : "Pausada"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{s.market}</Badge>
                  {s.symbols.map((sym) => (
                    <Badge key={sym} variant="secondary" className="font-mono text-[10px]">{sym}</Badge>
                  ))}
                  {s.timeframes.map((tf) => (
                    <Badge key={tf} variant="secondary" className="font-mono text-[10px]">{tf}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Score min: <strong className="text-foreground font-mono">{s.scoreMin}</strong></span>
                  <span>Sinais: <strong className="text-foreground font-mono">{s.signals}</strong></span>
                  <span>Win: <strong className="text-bull font-mono">{s.winRate}%</strong></span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    {s.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
