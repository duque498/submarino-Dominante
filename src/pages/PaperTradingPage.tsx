import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Loader2, Target, LogOut, Trash2 } from "lucide-react";
import { usePaperTrades, useClosePaperTrade, useDeletePaperTrade } from "@/hooks/use-paper-trades";
import { useTickers } from "@/hooks/use-bybit";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function PaperTradingPage() {
  const { data: trades, isLoading } = usePaperTrades();
  const { data: tickers } = useTickers("linear");
  const closeTrade = useClosePaperTrade();
  const deleteTrade = useDeletePaperTrade();
  const tickerMap = new Map((tickers || []).map((t) => [t.symbol, t]));

  const openTrades = (trades || []).filter((t) => t.status === "open");
  const closedTrades = (trades || []).filter((t) => t.status === "closed");

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl_percent || 0), 0);
  const wins = closedTrades.filter((t) => (t.pnl_percent || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(0) : "—";

  const handleClose = (t: any) => {
    const ticker = tickerMap.get(t.symbol);
    const currentPrice = ticker?.lastPrice || t.entry_price;
    const isLong = t.direction === "buy";
    const pnl = isLong
      ? ((currentPrice - t.entry_price) / t.entry_price) * 100
      : ((t.entry_price - currentPrice) / t.entry_price) * 100;
    closeTrade.mutate({ id: t.id, exit_price: currentPrice, pnl_percent: pnl });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Paper Trading</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe suas operações simuladas em tempo real
          </p>
        </div>
        <Badge variant="neutral">Modo Simulação</Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Posições Abertas", value: String(openTrades.length) },
          { label: "Total Simulado", value: String(trades?.length ?? 0) },
          { label: "Win Rate", value: `${winRate}%` },
          {
            label: "P&L Total",
            value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}%`,
            color: totalPnl >= 0 ? "text-bull" : "text-bear",
          },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">{m.label}</span>
            <div className={cn("mt-1 text-xl font-bold font-mono text-foreground", (m as any).color)}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !trades?.length ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma operação simulada. Clique "Entrei" em um alerta para criar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...openTrades, ...closedTrades].map((t) => {
            const ticker = tickerMap.get(t.symbol);
            const currentPrice = ticker?.lastPrice;
            const isLong = t.direction === "buy";
            const livePnl =
              t.status === "open" && currentPrice
                ? isLong
                  ? ((currentPrice - t.entry_price) / t.entry_price) * 100
                  : ((t.entry_price - currentPrice) / t.entry_price) * 100
                : t.pnl_percent;

            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4",
                  t.status === "open" ? "border-primary/30 bg-card" : "border-border bg-card/50"
                )}
              >
              <div className="flex items-center gap-2 md:gap-4 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm md:text-base text-foreground">{t.symbol}</span>
                      <Badge variant={isLong ? "bull" : "bear"} className="text-[10px]">
                        {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      </Badge>
                      <Badge
                        variant={t.status === "open" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {t.status === "open" ? "Aberta" : "Fechada"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex gap-2 md:gap-3 text-[10px] md:text-xs text-muted-foreground font-mono flex-wrap">
                      <span>E: ${t.entry_price.toLocaleString()}</span>
                      {t.stop_price && <span className="text-bear">SL: ${t.stop_price.toLocaleString()}</span>}
                      {t.target_price && <span className="text-bull">TP: ${t.target_price.toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-mono font-bold",
                        (livePnl ?? 0) >= 0 ? "text-bull" : "text-bear"
                      )}
                    >
                      {livePnl !== null && livePnl !== undefined
                        ? `${livePnl >= 0 ? "+" : ""}${livePnl.toFixed(2)}%`
                        : "—"}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {t.status === "open" && currentPrice
                        ? `$${currentPrice.toLocaleString()}`
                        : t.exit_price
                        ? `$${t.exit_price.toLocaleString()}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {t.status === "open" && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-bear/30 text-bear hover:bg-bear/10 hover:text-bear"
                        title="Sair da operação"
                        onClick={() => handleClose(t)}
                        disabled={closeTrade.isPending}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 border-destructive/30 text-destructive hover:bg-destructive/10"
                      title="Excluir trade"
                      onClick={() => deleteTrade.mutate(t.id)}
                      disabled={deleteTrade.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
