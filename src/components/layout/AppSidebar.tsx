import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Globe,
  LineChart,
  Puzzle,
  Bell,
  History,
  FlaskConical,
  Target,
  Settings,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/mercado", icon: Globe, label: "Mercado" },
  { to: "/grafico", icon: LineChart, label: "Gráfico" },
  { to: "/estrategias", icon: Puzzle, label: "Estratégias" },
  { to: "/alertas", icon: Bell, label: "Alertas" },
  { to: "/historico", icon: History, label: "Histórico" },
  { to: "/backtests", icon: FlaskConical, label: "Backtests" },
  { to: "/paper-trading", icon: Target, label: "Paper Trading" },
  { to: "/configuracoes", icon: Settings, label: "Configurações" },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col border-r border-border bg-sidebar lg:w-56">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <Radar className="h-6 w-6 shrink-0 text-primary" />
        <span className="hidden text-sm font-bold tracking-tight text-foreground lg:block">
          Radar Alpha
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || 
            (item.to !== "/" && location.pathname.startsWith(item.to));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <div className="h-2 w-2 rounded-full bg-bull animate-pulse-glow" />
          <span>Bybit Online</span>
        </div>
      </div>
    </aside>
  );
}
