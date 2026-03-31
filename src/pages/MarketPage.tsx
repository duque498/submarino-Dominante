import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Star, LineChart, TrendingUp, TrendingDown } from "lucide-react";

const mockSymbols = [
  { symbol: "BTCUSDT", price: "67,432.50", change24h: 2.34, volume: "1.2B", type: "perp", score: 74 },
  { symbol: "ETHUSDT", price: "3,521.80", change24h: -1.12, volume: "890M", type: "perp", score: 68 },
  { symbol: "SOLUSDT", price: "142.65", change24h: 5.67, volume: "432M", type: "perp", score: 62 },
  { symbol: "BTCUSDT", price: "67,430.00", change24h: 2.30, volume: "320M", type: "spot", score: 58 },
  { symbol: "ETHUSDT", price: "3,520.50", change24h: -1.15, volume: "210M", type: "spot", score: 45 },
];

export default function MarketPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "spot" | "perp">("all");

  const filtered = mockSymbols.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || s.type === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Explorador de Mercado</h1>
        <p className="text-sm text-muted-foreground">Símbolos monitorados e oportunidades</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar símbolo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-card pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "perp", "spot"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "secondary"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Todos" : f === "perp" ? "Perpétuo" : "Spot"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Símbolo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Preço</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">24h</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Volume</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Score</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={`${s.symbol}-${s.type}-${i}`} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                <td className="px-4 py-3 font-mono font-semibold text-foreground">{s.symbol}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px]">{s.type === "perp" ? "PERP" : "SPOT"}</Badge>
                </td>
                <td className="px-4 py-3 text-right font-mono text-foreground">${s.price}</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={s.change24h >= 0 ? "text-bull" : "text-bear"}>
                    <span className="inline-flex items-center gap-1">
                      {s.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {s.change24h >= 0 ? "+" : ""}{s.change24h}%
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">{s.volume}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-mono font-bold ${s.score >= 60 ? "text-bull" : "text-muted-foreground"}`}>{s.score}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Star className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><LineChart className="h-3 w-3" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
