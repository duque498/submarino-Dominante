import { useEffect, useRef } from "react";
import { usePaperTrades, useClosePaperTrade } from "./use-paper-trades";
import { useTickers } from "./use-bybit";
import { useAuth } from "./use-auth";
import { toast } from "sonner";
import { triggerPushNotification } from "@/lib/push-subscription";

/**
 * Monitors open paper trades against live prices.
 * Sends toast notifications and auto-closes when TP or SL is hit.
 */
export function useTradeMonitor() {
  const { data: openTrades } = usePaperTrades("open");
  const { data: tickers } = useTickers("linear");
  const closeTrade = useClosePaperTrade();
  const { user } = useAuth();
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!openTrades?.length || !tickers?.length) return;

    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    for (const trade of openTrades) {
      if (notifiedRef.current.has(trade.id)) continue;

      const ticker = tickerMap.get(trade.symbol);
      if (!ticker) continue;

      const price = ticker.lastPrice;
      const isLong = trade.direction === "buy";

      // Check TP
      if (trade.target_price) {
        const tpHit = isLong
          ? price >= trade.target_price
          : price <= trade.target_price;

        if (tpHit) {
          notifiedRef.current.add(trade.id);
          const pnl = isLong
            ? ((price - trade.entry_price) / trade.entry_price) * 100
            : ((trade.entry_price - price) / trade.entry_price) * 100;

          toast.success(`🎯 TP atingido! ${trade.symbol}`, {
            description: `Entrada: $${trade.entry_price} → Saída: $${price.toFixed(2)} | PnL: +${pnl.toFixed(2)}%`,
            duration: 15000,
          });
          if (user?.id) {
            triggerPushNotification({
              userId: user.id,
              title: `✅ TP Atingido — ${trade.symbol}`,
              body: `Entrada: $${trade.entry_price} → $${price.toFixed(2)} | PnL: +${pnl.toFixed(2)}%`,
              tag: `tp-${trade.symbol}`,
            });
          }

          closeTrade.mutate({
            id: trade.id,
            exit_price: price,
            pnl_percent: Number(pnl.toFixed(2)),
          });
          continue;
        }
      }

      // Check SL
      if (trade.stop_price) {
        const slHit = isLong
          ? price <= trade.stop_price
          : price >= trade.stop_price;

        if (slHit) {
          notifiedRef.current.add(trade.id);
          const pnl = isLong
            ? ((price - trade.entry_price) / trade.entry_price) * 100
            : ((trade.entry_price - price) / trade.entry_price) * 100;

          toast.error(`🛑 SL atingido! ${trade.symbol}`, {
            description: `Entrada: $${trade.entry_price} → Saída: $${price.toFixed(2)} | PnL: ${pnl.toFixed(2)}%`,
            duration: 15000,
          });
          if (user?.id) {
            triggerPushNotification({
              userId: user.id,
              title: `❌ SL Atingido — ${trade.symbol}`,
              body: `Entrada: $${trade.entry_price} → $${price.toFixed(2)} | PnL: ${pnl.toFixed(2)}%`,
              tag: `sl-${trade.symbol}`,
            });
          }

          closeTrade.mutate({
            id: trade.id,
            exit_price: price,
            pnl_percent: Number(pnl.toFixed(2)),
          });
        }
      }
    }
  }, [openTrades, tickers, closeTrade, user]);
}
