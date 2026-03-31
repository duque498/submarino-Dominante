import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus } from "lucide-react";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import { useState } from "react";

const TIMEFRAMES = ["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W"];
const TIMEFRAME_LABELS: Record<string, string> = {
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1H", "120": "2H", "240": "4H", "360": "6H", "720": "12H",
  "D": "1D", "W": "1W",
};

const POPULAR_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT",
  "MATICUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT", "APTUSDT",
];

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyMarketForm({ draftHook }: Props) {
  const { draft, updateDraft } = draftHook;
  const [symbolInput, setSymbolInput] = useState("");

  const addSymbol = (sym: string) => {
    const s = sym.trim().toUpperCase();
    if (s && !draft.symbols.includes(s)) {
      updateDraft("symbols", [...draft.symbols, s]);
    }
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) => {
    updateDraft("symbols", draft.symbols.filter((s) => s !== sym));
  };

  const toggleTimeframe = (tf: string) => {
    if (draft.timeframes.includes(tf)) {
      updateDraft("timeframes", draft.timeframes.filter((t) => t !== tf));
    } else {
      updateDraft("timeframes", [...draft.timeframes, tf]);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Mercado e Ativos</h2>

      {/* Exchange & Market */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Exchange</Label>
          <Select value={draft.exchange} disabled>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bybit">Bybit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mercado</Label>
          <Select
            value={draft.market}
            onValueChange={(v) => updateDraft("market", v as any)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Perpétuo (USDT)</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Symbols */}
      <div className="space-y-2">
        <Label className="text-xs">Ativos Monitorados</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {draft.symbols.map((sym) => (
            <Badge key={sym} variant="secondary" className="font-mono text-[10px] gap-1 h-5">
              {sym}
              <button onClick={() => removeSymbol(sym)}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSymbol(symbolInput))}
            placeholder="Adicionar símbolo (ex: BTCUSDT)"
            className="h-8 text-xs font-mono flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => addSymbol(symbolInput)}
            disabled={!symbolInput.trim()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Quick add popular symbols */}
        <div className="flex flex-wrap gap-1">
          {POPULAR_SYMBOLS.filter((s) => !draft.symbols.includes(s)).slice(0, 10).map((sym) => (
            <button
              key={sym}
              onClick={() => addSymbol(sym)}
              className="text-[9px] font-mono text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded border border-border hover:border-primary/30 transition-colors"
            >
              + {sym}
            </button>
          ))}
        </div>
      </div>

      {/* Timeframes */}
      <div className="space-y-2">
        <Label className="text-xs">Timeframes</Label>
        <div className="flex flex-wrap gap-1.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => toggleTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                draft.timeframes.includes(tf)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {TIMEFRAME_LABELS[tf] || tf}
            </button>
          ))}
        </div>
      </div>

      {/* Cooldown & Max Alerts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Cooldown (minutos)</Label>
          <Input
            type="number"
            value={draft.cooldownMinutes}
            onChange={(e) => updateDraft("cooldownMinutes", parseInt(e.target.value) || 0)}
            min={0}
            className="h-9 font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Max Alertas/Ativo/Dia</Label>
          <Input
            type="number"
            value={draft.maxAlertsPerSymbolPerDay}
            onChange={(e) => updateDraft("maxAlertsPerSymbolPerDay", parseInt(e.target.value) || 1)}
            min={1}
            className="h-9 font-mono"
          />
        </div>
      </div>

      {/* Time Window */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Janela de Horário (início)</Label>
          <Input
            type="time"
            value={draft.timeWindowStart || ""}
            onChange={(e) => updateDraft("timeWindowStart", e.target.value || null)}
            className="h-9 font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Janela de Horário (fim)</Label>
          <Input
            type="time"
            value={draft.timeWindowEnd || ""}
            onChange={(e) => updateDraft("timeWindowEnd", e.target.value || null)}
            className="h-9 font-mono"
          />
        </div>
      </div>
    </div>
  );
}
