import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bell, TrendingUp, TrendingDown, Check, X, ExternalLink, Loader2 } from "lucide-react";
import { useSignals, useUnreadAlerts } from "@/hooks/use-signals";
import { useCreatePaperTrade } from "@/hooks/use-paper-trades";
import { useTickers } from "@/hooks/use-bybit";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function NotificationPanel() {
  const { data: signals, isLoading } = useSignals(20);
  const { data: unreadCount } = useUnreadAlerts();
  const createPaperTrade = useCreatePaperTrade();
  const { data: tickers } = useTickers("linear");
  const [enteredSignals, setEnteredSignals] = useState<Set<string>>(new Set());
  const [skippedSignals, setSkippedSignals] = useState<Set<string>>(new Set());

  const tickerMap = new Map((tickers || []).map((t) => [t.symbol, t]));

  const handleEnter = (signal: NonNullable<typeof signals>[0]) => {
    if (!signal.entry_price) {
      toast.error("Sinal sem preço de entrada definido");
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

  const handleSkip = (signalId: string) => {
    setSkippedSignals((prev) => new Set(prev).add(signalId));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {(unreadCount ?? 0) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md border-border bg-card overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-foreground">Oportunidades</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !signals?.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum sinal gerado ainda. Configure e ative uma estratégia.
            </div>
          ) : (
            signals.map((signal) => {
              const entered = enteredSignals.has(signal.id);
              const skipped = skippedSignals.has(signal.id);
              const ticker = tickerMap.get(signal.symbol);
              const currentPrice = ticker?.lastPrice;

              return (
                <div
                  key={signal.id}
                  className={cn(
                    "rounded-lg border p-4 transition-all",
                    entered
                      ? "border-bull/30 bg-bull/5"
                      : skipped
                      ? "border-border/50 opacity-50"
                      : "border-border bg-background hover:border-primary/30"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={signal.score} size="sm" />
                      <span className="font-mono font-bold text-foreground">
                        {signal.symbol}
                      </span>
                      <Badge variant={signal.direction === "long" ? "bull" : "bear"} className="text-[10px]">
                        {signal.direction === "long" ? (
                          <><TrendingUp className="mr-1 h-3 w-3" />Compra</>
                        ) : (
                          <><TrendingDown className="mr-1 h-3 w-3" />Venda</>
                        )}
                      </Badge>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {signal.timeframe}
                    </Badge>
                  </div>

                  {/* Entry details */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-muted/50 p-2">
                      <span className="text-muted-foreground">Entrada</span>
                      <p className="font-mono font-semibold text-foreground">
                        ${signal.entry_price?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <span className="text-muted-foreground">Preço Atual</span>
                      <p className="font-mono font-semibold text-foreground">
                        ${currentPrice?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                    <div className="rounded bg-bull/10 p-2">
                      <span className="text-bull">Take Profit</span>
                      <p className="font-mono font-semibold text-bull">
                        ${signal.target1_price?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                    <div className="rounded bg-bear/10 p-2">
                      <span className="text-bear">Stop Loss</span>
                      <p className="font-mono font-semibold text-bear">
                        ${signal.stop_price?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* R/R and justification */}
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    {signal.rr_ratio && (
                      <span className="font-mono">R/R: {signal.rr_ratio.toFixed(1)}</span>
                    )}
                    <span>
                      {new Date(signal.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {signal.justification && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {signal.justification}
                    </p>
                  )}

                  {/* Action buttons */}
                  {!entered && !skipped && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5 bg-bull hover:bg-bull/90 text-white"
                        onClick={() => handleEnter(signal)}
                        disabled={createPaperTrade.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Entrei
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5"
                        onClick={() => handleSkip(signal.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                        Pulei
                      </Button>
                    </div>
                  )}

                  {entered && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-bull">
                      <Check className="h-3.5 w-3.5" />
                      <span className="font-medium">Paper trade criado — monitorando TP/SL</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
