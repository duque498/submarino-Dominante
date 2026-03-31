import { Activity, Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBybitConnection } from "@/hooks/use-bybit-connection";
import { useEffect, useState } from "react";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { useTradeMonitor } from "@/hooks/use-trade-monitor";

interface AppTopbarProps {
  onNotificationsClick?: () => void;
}

export function AppTopbar({ onNotificationsClick }: AppTopbarProps) {
  const connection = useBybitConnection();
  const [time, setTime] = useState(new Date());

  // Activate TP/SL monitor globally
  useTradeMonitor();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {connection.connected ? (
            <Wifi className="h-4 w-4 text-bull" />
          ) : (
            <WifiOff className="h-4 w-4 text-bear" />
          )}
          <span className="text-xs text-muted-foreground">Exchange</span>
          <Badge variant={connection.connected ? "bull" : "bear"} className="text-[10px]">
            {connection.connected ? "Online" : "Offline"}
          </Badge>
          {connection.latency && (
            <span className="text-[10px] font-mono text-muted-foreground">{connection.latency}ms</span>
          )}
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Scanner</span>
          <Badge variant="secondary" className="text-[10px]">Ativo</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground md:block font-mono">
          {time.toLocaleTimeString("pt-BR")}
        </span>
        <NotificationPanel />
      </div>
    </header>
  );
}
