import { Bell, Activity, Wifi } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AppTopbarProps {
  onNotificationsClick?: () => void;
}

export function AppTopbar({ onNotificationsClick }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-bull" />
          <span className="text-xs text-muted-foreground">Exchange</span>
          <Badge variant="bull" className="text-[10px]">Online</Badge>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">Scanner</span>
          <Badge variant="default" className="text-[10px]">Ativo</Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground md:block font-mono">
          {new Date().toLocaleTimeString("pt-BR")}
        </span>
        <Button variant="ghost" size="icon" onClick={onNotificationsClick} className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            3
          </span>
        </Button>
      </div>
    </header>
  );
}
