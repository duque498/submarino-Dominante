import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Target,
  Clock,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import type { MarketContext, ParsedCondition, EvaluationResult, DirectionSummary } from "@/lib/condition-evaluator";
import {
  parseConditions,
  evaluateConditions,
  summarizeDirection,
} from "@/lib/condition-evaluator";

interface LiveConditionsPanelProps {
  strategy: {
    id: string;
    name: string;
    direction: string;
    market: string;
    indicators: Tables<"strategy_indicators">[];
    conditions: Tables<"strategy_conditions">[];
    symbols: Tables<"strategy_symbols">[];
    timeframes: Tables<"strategy_timeframes">[];
  };
  symbol: string;
  timeframe: string;
  ctx: MarketContext;
}

function formatValue(v: number | null, type: string): string {
  if (v == null || isNaN(v)) return "—";
  if (type === "rsi" || type === "adx" || type === "stochastic" || type === "stoch_rsi") return v.toFixed(1);
  if (type === "volume_sma") return `${v.toFixed(2)}x`;
  if (type === "funding_rate" || type === "spread") return `${v.toFixed(4)}%`;
  if (Math.abs(v) > 100) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(4);
}

function DirectionBlock({
  label,
  icon: Icon,
  iconColor,
  parsed,
  results,
  summary,
}: {
  label: string;
  icon: typeof TrendingUp;
  iconColor: string;
  parsed: ParsedCondition[];
  results: EvaluationResult[];
  summary: DirectionSummary;
}) {
  const progressColor =
    summary.status === "confirmed"
      ? "bg-bull"
      : summary.status === "almost"
      ? "bg-yellow-500"
      : "bg-muted-foreground/30";

  return (
    <div className="space-y-2">
      {/* Direction header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <span
          className={`text-xs font-mono font-bold ${
            summary.status === "confirmed"
              ? "text-bull"
              : summary.status === "almost"
              ? "text-yellow-400"
              : "text-muted-foreground"
          }`}
        >
          {summary.passed}/{summary.total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
        <div
          className={`h-full transition-all duration-500 rounded-full ${progressColor}`}
          style={{ width: `${summary.ratio * 100}%` }}
        />
      </div>

      {/* Conditions list */}
      <div className="space-y-0.5">
        {parsed.map((pc) => {
          const result = results.find((r) => r.conditionId === pc.id);
          const passed = result?.passed ?? false;
          const hasError = !!result?.error || !pc.validation.valid;
          const errorMsg = result?.error || pc.validation.error;

          return (
            <div
              key={pc.id}
              className={`flex items-center gap-2 text-[11px] py-0.5 px-1.5 rounded transition-colors ${
                hasError
                  ? "bg-yellow-500/5"
                  : passed
                  ? "bg-bull/5"
                  : ""
              }`}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {hasError ? (
                  <AlertTriangle className="h-3 w-3 text-yellow-500" />
                ) : passed ? (
                  <CheckCircle2 className="h-3 w-3 text-bull" />
                ) : (
                  <XCircle className="h-3 w-3 text-bear/50" />
                )}
              </div>

              {/* Condition label — use direction-specific effective label */}
              <div className="flex-1 min-w-0 truncate">
                <span
                  className={
                    hasError
                      ? "text-yellow-500"
                      : passed
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {result?.effectiveLabel || pc.label}
                </span>
                {hasError && (
                  <span className="ml-1 text-[9px] text-yellow-500/70">({errorMsg})</span>
                )}
              </div>

              {/* Live values */}
              {!hasError && result && (
                <div className="shrink-0 text-[9px] font-mono text-muted-foreground">
                  {result.leftValue != null && !isNaN(result.leftValue)
                    ? formatValue(result.leftValue, pc.leftType)
                    : ""}
                </div>
              )}

              {/* Role badge */}
              {pc.role === "required" && (
                <span className="shrink-0 text-[8px] text-yellow-500">★</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Status message */}
      {summary.status === "confirmed" && (
        <div className="rounded bg-bull/10 px-2 py-1 text-center">
          <span className="text-[10px] font-bold text-bull flex items-center justify-center gap-1">
            <Zap className="h-3 w-3" />
            SINAL {label} CONFIRMADO
          </span>
        </div>
      )}
      {summary.status === "almost" && summary.missingConditions.length > 0 && (
        <div className="rounded bg-yellow-500/10 px-2 py-1">
          <span className="text-[9px] text-yellow-400">
            Falta: {summary.missingConditions.slice(0, 2).join(", ")}
            {summary.missingConditions.length > 2 && ` +${summary.missingConditions.length - 2}`}
          </span>
        </div>
      )}
    </div>
  );
}

export function LiveConditionsPanel({ strategy, symbol, timeframe, ctx }: LiveConditionsPanelProps) {
  const parsed = useMemo(
    () => parseConditions(strategy.conditions, strategy.indicators),
    [strategy.conditions, strategy.indicators]
  );

  const validCount = parsed.filter((p) => p.validation.valid).length;
  const invalidCount = parsed.length - validCount;

  const longResults = useMemo(
    () => evaluateConditions(parsed, ctx, "long"),
    [parsed, ctx]
  );

  const shortResults = useMemo(
    () => evaluateConditions(parsed, ctx, "short"),
    [parsed, ctx]
  );

  const longSummary = useMemo(
    () => summarizeDirection(parsed, longResults, "long"),
    [parsed, longResults]
  );

  const shortSummary = useMemo(
    () => summarizeDirection(parsed, shortResults, "short"),
    [parsed, shortResults]
  );

  const showLong = strategy.direction === "long" || strategy.direction === "both";
  const showShort = strategy.direction === "short" || strategy.direction === "both";

  // Overall status
  const overallStatus =
    longSummary.status === "confirmed" || shortSummary.status === "confirmed"
      ? "confirmed"
      : longSummary.status === "almost" || shortSummary.status === "almost"
      ? "almost"
      : "no_signal";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header with strategy info */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            Condições ao Vivo
          </h3>
          <Badge
            variant={
              overallStatus === "confirmed"
                ? "bull"
                : overallStatus === "almost"
                ? "outline"
                : "secondary"
            }
            className="text-[9px]"
          >
            {overallStatus === "confirmed"
              ? "🎯 Sinal!"
              : overallStatus === "almost"
              ? "⏳ Quase"
              : "Sem sinal"}
          </Badge>
        </div>

        {/* Strategy metadata */}
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[9px] font-mono">
            {strategy.name}
          </Badge>
          <Badge variant="outline" className="text-[9px] font-mono">
            {symbol}
          </Badge>
          <Badge variant="outline" className="text-[9px] font-mono flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeframe}
          </Badge>
          <Badge variant="outline" className="text-[9px] font-mono">
            {strategy.market === "linear" ? "PERP" : "SPOT"}
          </Badge>
        </div>
      </div>

      {/* Invalid conditions warning */}
      {invalidCount > 0 && (
        <div className="rounded bg-yellow-500/10 px-2 py-1 flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
          <span className="text-[10px] text-yellow-400">
            {invalidCount} condição(ões) inválida(s)
          </span>
        </div>
      )}

      {/* No conditions */}
      {parsed.length === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            Nenhuma condição configurada nesta estratégia.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-1">
            Adicione condições no Strategy Builder.
          </p>
        </div>
      )}

      {/* LONG block */}
      {showLong && parsed.length > 0 && (
        <DirectionBlock
          label="LONG"
          icon={TrendingUp}
          iconColor="text-bull"
          parsed={parsed}
          results={longResults}
          summary={longSummary}
        />
      )}

      {/* Separator */}
      {showLong && showShort && parsed.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* SHORT block */}
      {showShort && parsed.length > 0 && (
        <DirectionBlock
          label="SHORT"
          icon={TrendingDown}
          iconColor="text-bear"
          parsed={parsed}
          results={shortResults}
          summary={shortSummary}
        />
      )}
    </div>
  );
}

// Export evaluation data for use by ChartPage alerts
export { parseConditions, evaluateConditions, summarizeDirection };
export type { ParsedCondition, EvaluationResult, DirectionSummary };
