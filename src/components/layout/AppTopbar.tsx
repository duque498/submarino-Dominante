import { Activity, Wifi, WifiOff, Bell, BellOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBybitConnection } from "@/hooks/use-bybit-connection";
import { useEffect, useState } from "react";
import { NotificationPanel } from "@/components/notifications/NotificationPanel";
import { useTradeMonitor } from "@/hooks/use-trade-monitor";
import { isPushSupported, getPushPermission, requestPushPermission } from "@/lib/audio-notifications";
import { subscribeToPush } from "@/lib/push-subscription";

interface AppTopbarProps {
  onNotificationsClick?: () => void;
}

export function AppTopbar({ onNotificationsClick }: AppTopbarProps) {
  const connection = useBybitConnection();
  const [time, setTime] = useState(new Date());
  const [pushState, setPushState] = useState<NotificationPermission | "unsupported">("unsupported");

  // Activate TP/SL monitor globally
  useTradeMonitor();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const perm = getPushPermission();
    setPushState(perm);
    // Auto-subscribe if already granted (ensures DB has the subscription)
    if (perm === "granted") {
      subscribeToPush();
    }
  }, []);

  const handlePushToggle = async () => {
    if (pushState === "granted") return;
    if (pushState === "denied") return;
    const ok = await requestPushPermission();
    if (ok) {
      // Subscribe to Web Push and save to DB
      await subscribeToPush();
    }
    setPushState(ok ? "granted" : getPushPermission());
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 md:h-14 items-center justify-between border-b border-border bg-card/80 px-2 md:px-4 backdrop-blur-sm">
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
        {/* Push notification toggle */}
        {isPushSupported() && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handlePushToggle}
              >
                {pushState === "granted" ? (
                  <Bell className="h-4 w-4 text-bull" />
                ) : pushState === "denied" ? (
                  <BellOff className="h-4 w-4 text-bear" />
                ) : (
                  <Bell className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {pushState === "granted"
                ? "Notificações push ativadas"
                : pushState === "denied"
                  ? "Notificações bloqueadas — habilite nas configurações do navegador"
                  : "Ativar notificações push"}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="hidden text-xs text-muted-foreground md:block font-mono">
          {time.toLocaleTimeString("pt-BR")}
        </span>
        <NotificationPanel />
      </div>
    </header>
  );
}
