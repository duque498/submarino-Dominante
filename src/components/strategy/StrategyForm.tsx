import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateStrategy } from "@/hooks/use-strategies";
import { X } from "lucide-react";

const POPULAR_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "AVAXUSDT", "ADAUSDT", "DOTUSDT", "MATICUSDT",
  "LINKUSDT", "LTCUSDT", "UNIUSDT", "ATOMUSDT", "NEARUSDT",
];

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];

interface StrategyFormProps {
  open: boolean;
  onClose: () => void;
}

export function StrategyForm({ open, onClose }: StrategyFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [market, setMarket] = useState("linear");
  const [scoreMin, setScoreMin] = useState(60);
  const [minRr, setMinRr] = useState(1.8);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(["BTCUSDT", "ETHUSDT"]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["5m", "15m"]);
  const [symbolInput, setSymbolInput] = useState("");

  const createStrategy = useCreateStrategy();

  const toggleSymbol = (s: string) => {
    setSelectedSymbols((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((x) => x !== tf) : [...prev, tf]
    );
  };

  const addCustomSymbol = () => {
    const sym = symbolInput.toUpperCase().trim();
    if (sym && !selectedSymbols.includes(sym)) {
      setSelectedSymbols((prev) => [...prev, sym]);
      setSymbolInput("");
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    createStrategy.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        market,
        scoreMin,
        minRr,
        symbols: selectedSymbols,
        timeframes: selectedTimeframes,
      },
      { onSuccess: () => {
        onClose();
        setName("");
        setDescription("");
        setSelectedSymbols(["BTCUSDT", "ETHUSDT"]);
        setSelectedTimeframes(["5m", "15m"]);
      }}
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Estratégia</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              placeholder="Ex: Rompimento com Confluência"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              placeholder="Descreva a lógica da estratégia..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Market */}
          <div className="space-y-1.5">
            <Label>Mercado</Label>
            <Select value={market} onValueChange={setMarket}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear">Perpétuo (USDT)</SelectItem>
                <SelectItem value="spot">Spot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Score Min + Min R/R */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Score Mínimo</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={scoreMin}
                onChange={(e) => setScoreMin(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>R/R Mínimo</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={minRr}
                onChange={(e) => setMinRr(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Symbols */}
          <div className="space-y-2">
            <Label>Símbolos</Label>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSymbol(s)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-mono transition-colors ${
                    selectedSymbols.includes(s)
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.replace("USDT", "")}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Símbolo customizado"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomSymbol())}
                className="text-xs"
              />
              <Button variant="secondary" size="sm" onClick={addCustomSymbol}>
                Adicionar
              </Button>
            </div>
            {selectedSymbols.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedSymbols.map((s) => (
                  <Badge key={s} variant="secondary" className="font-mono text-[10px] gap-1">
                    {s}
                    <button onClick={() => toggleSymbol(s)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Timeframes */}
          <div className="space-y-2">
            <Label>Timeframes</Label>
            <div className="flex flex-wrap gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => toggleTimeframe(tf)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-mono transition-colors ${
                    selectedTimeframes.includes(tf)
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || createStrategy.isPending}>
              {createStrategy.isPending ? "Criando..." : "Criar Estratégia"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
