import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Bell, Check, TrendingUp, TrendingDown, Loader2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useSignals } from "@/hooks/use-signals";
import { usePaperTrades } from "@/hooks/use-paper-trades";
import { useCreatePaperTrade } from "@/hooks/use-paper-trades";
import { useTickers } from "@/hooks/use-bybit";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AlertsPage() {
  const [filter, setFilter] = useState<"all" | "high" | "entered" | "skipped">("all");
  const { data: signals, isLoading: loadingSignals } = useSignals(100);
  const { data: paperTrades } = usePaperTrades();
  const { data: tickers } = useTickers("linear");
  const createPaperTrade = useCreatePaperTrade();
  const [enteredSignals, setEnteredSignals] = useState<Set<string>>(new Set());
  const [skippedSignals, setSkippedSignals] = useState<Set<string>>(new Set());

  const tickerMap = new Map((tickers || []).map((t) => [t.symbol, t]));

  // Check which signals already have paper trades
  const signalsWithTrades = new Set(
    (paperTrades || []).filter((pt) => pt.signal_id).map((pt) => pt.signal_id!)
  );

  const filtered = (signals || []).filter((s) => {
    if (filter === "high") return s.score >= 70;
    if (filter === "entered") return signalsWithTrades.has(s.id) || enteredSignals.has(s.id);
    if (filter === "skipped") return skippedSignals.has(s.id);
    return true;
  });

  const handleEnter = (signal: NonNullable<typeof signals>[0]) => {
    if (!signal.entry_price) {
      toast.error("Sinal sem preço de entrada");
      return;
    }
    createPaperTrade.mutate({
      symbol: signal.symbol,
      direction: signal.direction,
      entry_price: signal.entry_price,
      stop_price: signal.stop_price ?? undefined,
      target_price: signal.target1_price ?? undefined,
      signal_id: signal.id,
    });
    setEnteredSignals((prev) => new Set(prev).add(signal.id));
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alertas & Oportunidades</h1>
          <p className="text-sm text-muted-foreground">
            Sinais gerados pelas suas estratégias — confirme se entrou e acompanhe em tempo real
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-mono">
          {signals?.length ?? 0} sinais
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {([
          { key: "all", label: "Todos" },
          { key: "high", label: "Score ≥ 70" },
          { key: "entered", label: "Entrei" },
          { key: "skipped", label: "Pulei" },
        ] as const).map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "secondary"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Signals list */}
      {loadingSignals ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "all"
              ? "Nenhum sinal gerado ainda. Ative uma estratégia no Strategy Builder."
              : "Nenhum sinal neste filtro."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((signal) => {
            const entered = signalsWithTrades.has(signal.id) || enteredSignals.has(signal.id);
            const skipped = skippedSignals.has(signal.id);
            const ticker = tickerMap.get(signal.symbol);

            return (
              <div
                key={signal.id}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  entered
                    ? "border-bull/30 bg-bull/5"
                    : skipped
                    ? "border-border/50 opacity-60"
                    : "border-border bg-card"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex items-start gap-3 flex-1">
                    <ScoreBadge score={signal.score} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-foreground text-lg">
                          {signal.symbol}
                        </span>
                        <Badge variant={signal.direction === "buy" ? "bull" : "bear"}>
                          {signal.direction === "buy" ? (
                            <><TrendingUp className="mr-1 h-3 w-3" />Compra</>
                          ) : (
                            <><TrendingDown className="mr-1 h-3 w-3" />Venda</>
                          )}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {signal.timeframe}
                        </Badge>
                        {signal.rr_ratio && (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            R/R {signal.rr_ratio.toFixed(1)}
                          </Badge>
                        )}
                      </div>

                      {/* Price grid */}
                      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Entrada</span>
                          <p className="font-mono font-semibold text-foreground">
                            ${signal.entry_price?.toLocaleString() ?? "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Atual</span>
                          <p className="font-mono font-semibold text-foreground">
                            ${ticker?.lastPrice?.toLocaleString() ?? "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-bull">TP</span>
                          <p className="font-mono font-semibold text-bull">
                            ${signal.target1_price?.toLocaleString() ?? "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-bear">SL</span>
                          <p className="font-mono font-semibold text-bear">
                            ${signal.stop_price?.toLocaleString() ?? "—"}
                          </p>
                        </div>
                      </div>

                      {signal.justification && (
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                          {signal.justification}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {new Date(signal.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {entered ? (
                      <Badge variant="bull" className="gap-1">
                        <Check className="h-3 w-3" />
                        Monitorando
                      </Badge>
                    ) : skipped ? (
                      <Badge variant="secondary">Pulado</Badge>
                    ) : (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="gap-1 bg-bull hover:bg-bull/90 text-white h-7 text-xs"
                          onClick={() => handleEnter(signal)}
                          disabled={createPaperTrade.isPending}
                        >
                          <Check className="h-3 w-3" />
                          Entrei
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSkippedSignals((prev) => new Set(prev).add(signal.id))}
                        >
                          Pulei
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
