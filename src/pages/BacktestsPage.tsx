import { Badge } from "@/components/ui/badge";

const mockBacktest = {
  strategy: "Rompimento com Confluência",
  period: "Jan 2025 — Mar 2025",
  trades: 142,
  winRate: 68.3,
  profitFactor: 2.14,
  avgWin: 1.82,
  avgLoss: -0.85,
  maxDrawdown: -4.2,
  totalPnl: 34.7,
  avgRR: 2.1,
  sampleWarning: false,
};

const MetricCard = ({ label, value, suffix, color }: { label: string; value: string | number; suffix?: string; color?: string }) => (
  <div className="rounded-lg border border-border bg-card p-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className={`mt-1 text-xl font-bold font-mono ${color || "text-foreground"}`}>
      {value}{suffix}
    </div>
  </div>
);

export default function BacktestsPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backtests</h1>
        <p className="text-sm text-muted-foreground">Validação histórica de estratégias</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-semibold text-foreground">{mockBacktest.strategy}</h2>
          <Badge variant="outline" className="text-[10px]">{mockBacktest.period}</Badge>
          {mockBacktest.sampleWarning && <Badge variant="bear" className="text-[10px]">Amostra pequena</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <MetricCard label="Trades" value={mockBacktest.trades} />
          <MetricCard label="Win Rate" value={mockBacktest.winRate} suffix="%" color="text-bull" />
          <MetricCard label="Profit Factor" value={mockBacktest.profitFactor} color="text-bull" />
          <MetricCard label="P&L Total" value={`+${mockBacktest.totalPnl}`} suffix="%" color="text-bull" />
          <MetricCard label="Max Drawdown" value={mockBacktest.maxDrawdown} suffix="%" color="text-bear" />
          <MetricCard label="Média Ganho" value={`+${mockBacktest.avgWin}`} suffix="%" color="text-bull" />
          <MetricCard label="Média Perda" value={mockBacktest.avgLoss} suffix="%" color="text-bear" />
          <MetricCard label="R/R Médio" value={mockBacktest.avgRR} />
        </div>
      </div>

      {/* Equity Curve placeholder */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Curva de Equity</h3>
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Gráfico de equity será implementado com dados reais
        </div>
      </div>
    </div>
  );
}
