import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Star, LineChart, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { useTickers } from "@/hooks/use-bybit";
import type { BybitCategory } from "@/services/bybit";

export default function MarketPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<BybitCategory>("linear");
  const navigate = useNavigate();

  const { data: tickers, isLoading, error } = useTickers(category);

  // Default watchlist symbols
  const watchlist = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT"];

  const filtered = (tickers || [])
    .filter((t) => watchlist.includes(t.symbol) || search.length > 0)
    .filter((t) => t.symbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.turnover24h) - Number(a.turnover24h))
    .slice(0, 50);

  const formatVolume = (v: string) => {
    const n = Number(v);
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
    return n.toFixed(0);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Explorador de Mercado</h1>
        <p className="text-sm text-muted-foreground">Dados em tempo real da Bybit</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar símbolo..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-card pl-9" />
        </div>
        <div className="flex gap-1">
          {([["linear", "Perpétuo"], ["spot", "Spot"]] as const).map(([cat, label]) => (
            <Button key={cat} variant={category === cat ? "default" : "secondary"} size="sm" onClick={() => setCategory(cat as BybitCategory)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando dados da Bybit...</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-bear/30 bg-bear/5 p-4 text-sm text-bear">
          Erro ao carregar dados: {(error as Error).message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Símbolo</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Preço</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">24h</th>
                <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground md:table-cell">Volume</th>
                <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground lg:table-cell">Spread</th>
                {category === "linear" && (
                  <th className="hidden px-4 py-3 text-right font-medium text-muted-foreground xl:table-cell">Funding</th>
                )}
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.symbol} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">{t.symbol}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">
                    ${t.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={`inline-flex items-center gap-1 ${t.change24h >= 0 ? "text-bull" : "text-bear"}`}>
                      {t.change24h >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(2)}%
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-muted-foreground md:table-cell">
                    ${formatVolume(t.turnover24h)}
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-muted-foreground lg:table-cell">
                    {t.spread.toFixed(4)}%
                  </td>
                  {category === "linear" && (
                    <td className="hidden px-4 py-3 text-right font-mono xl:table-cell">
                      <span className={Number(t.fundingRate) >= 0 ? "text-bull" : "text-bear"}>
                        {(Number(t.fundingRate) * 100).toFixed(4)}%
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/grafico?symbol=${t.symbol}&category=${category}`)}
                      >
                        <LineChart className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
