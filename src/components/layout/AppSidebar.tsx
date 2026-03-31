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
  Menu,
  X,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/mercado", icon: Globe, label: "Mercado" },
  { to: "/grafico", icon: LineChart, label: "Gráfico" },
  { to: "/estrategias", icon: Puzzle, label: "Estratégias" },
  { to: "/alertas", icon: Bell, label: "Alertas" },
  { to: "/historico", icon: History, label: "Histórico" },
  { to: "/backtests", icon: FlaskConical, label: "Backtests" },
  { to: "/paper-trading", icon: Target, label: "Paper" },
  { to: "/configuracoes", icon: Settings, label: "Config" },
];

// Main tabs shown in the bottom bar on mobile (max 5)
const mobileMainTabs = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/mercado", icon: Globe, label: "Mercado" },
  { to: "/grafico", icon: LineChart, label: "Gráfico" },
  { to: "/estrategias", icon: Puzzle, label: "Estratégias" },
];

export function AppSidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (to: string) =>
    location.pathname === to || (to !== "/" && location.pathname.startsWith(to));

  return (
    <>
      {/* ─── Desktop sidebar (hidden on mobile) ─── */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-16 flex-col border-r border-border bg-sidebar md:flex lg:w-56">
        <div className="flex h-14 items-center gap-2 border-b border-border px-3">
          <Radar className="h-6 w-6 shrink-0 text-primary" />
          <span className="hidden text-sm font-bold tracking-tight text-foreground lg:block">
            Radar Alpha
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.to)
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            <div className="h-2 w-2 rounded-full bg-bull animate-pulse-glow" />
            <span>Bybit Online</span>
          </div>
        </div>
      </aside>

      {/* ─── Mobile bottom tab bar ─── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-card/95 backdrop-blur-md md:hidden safe-area-bottom">
        {mobileMainTabs.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px]",
              isActive(item.to)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5", isActive(item.to) && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]")} />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </NavLink>
        ))}
        {/* More menu button */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md transition-colors min-w-[56px]",
            mobileOpen ? "text-primary" : "text-muted-foreground"
          )}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span className="text-[10px] font-medium leading-none">Mais</span>
        </button>
      </nav>

      {/* ─── Mobile "More" drawer ─── */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed bottom-14 left-0 right-0 z-50 rounded-t-2xl border-t border-border bg-card p-4 md:hidden animate-slide-in safe-area-bottom">
            <div className="grid grid-cols-4 gap-3">
              {navItems
                .filter((item) => !mobileMainTabs.find((t) => t.to === item.to))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors",
                      isActive(item.to)
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </NavLink>
                ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
