import { Badge } from "@/components/ui/badge";
import { validateStrategy, generateStrategySummary } from "@/types/strategy";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, CheckCircle, ChevronDown, FileJson, FileText } from "lucide-react";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import { useState } from "react";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyPreviewPanel({ draftHook }: Props) {
  const { draft } = draftHook;
  const [showJson, setShowJson] = useState(false);

  const errors = validateStrategy(draft);
  const summary = generateStrategySummary(draft);
  const criticalErrors = errors.filter((e) => e.severity === "error");
  const warnings = errors.filter((e) => e.severity === "warning");

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Preview da Estratégia</h2>

      {/* Validation */}
      <div className="border border-border rounded-lg p-3 bg-card/30 space-y-2">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          {criticalErrors.length === 0 ? (
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          )}
          Validação
        </h3>
        {errors.length === 0 ? (
          <p className="text-[10px] text-green-400">✓ Todas as validações passaram</p>
        ) : (
          <div className="space-y-1">
            {criticalErrors.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-red-400">
                <span>✗</span> <span>{e.message}</span>
                <Badge variant="outline" className="text-[8px] h-3.5 px-1">{e.field}</Badge>
              </div>
            ))}
            {warnings.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] text-yellow-400">
                <span>⚠</span> <span>{e.message}</span>
                <Badge variant="outline" className="text-[8px] h-3.5 px-1">{e.field}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border border-border rounded-lg p-3 bg-card/30">
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
          <FileText className="h-3.5 w-3.5" /> Resumo Textual
        </h3>
        <div className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
          {summary}
        </div>
      </div>

      {/* Checklist */}
      <div className="border border-border rounded-lg p-3 bg-card/30">
        <h3 className="text-xs font-semibold text-foreground mb-2">Checklist</h3>
        <div className="space-y-1">
          {[
            { label: "Nome definido", ok: !!draft.name.trim() },
            { label: "Ativos selecionados", ok: draft.symbols.length > 0 },
            { label: "Timeframes selecionados", ok: draft.timeframes.length > 0 },
            { label: "Indicadores configurados", ok: draft.indicators.length > 0 },
            { label: "Condições definidas", ok: draft.conditionGroups.some((g) => g.conditions.length > 0) },
            { label: "Pesos somam 100%", ok: Object.values(draft.scoreWeights).reduce((a, b) => a + b, 0) === 100 },
            { label: "Stop configurado", ok: draft.riskRules.stopValue > 0 },
            { label: "Pelo menos um alvo", ok: draft.riskRules.targets.length > 0 },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className={item.ok ? "text-green-400" : "text-muted-foreground"}>
                {item.ok ? "✓" : "○"}
              </span>
              <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* JSON Preview */}
      <Collapsible open={showJson} onOpenChange={setShowJson}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <FileJson className="h-3.5 w-3.5" />
          <span>Preview JSON</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${showJson ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 p-3 rounded-lg bg-background border border-border text-[10px] font-mono text-muted-foreground overflow-auto max-h-96">
            {JSON.stringify(draft, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
