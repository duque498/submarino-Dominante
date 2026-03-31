import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import type { RiskRules } from "@/types/strategy";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyRiskEditor({ draftHook }: Props) {
  const { draft, updateDraft } = draftHook;
  const risk = draft.riskRules;

  const updateRisk = <K extends keyof RiskRules>(key: K, value: RiskRules[K]) => {
    updateDraft("riskRules", { ...risk, [key]: value });
  };

  const addTarget = () => {
    updateRisk("targets", [
      ...risk.targets,
      { label: `TP${risk.targets.length + 1}`, rrMultiple: risk.targets.length + 1 },
    ]);
  };

  const removeTarget = (idx: number) => {
    updateRisk("targets", risk.targets.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Risco e Execução</h2>

      {/* Stop Loss */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-foreground">Stop Loss</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de Stop</Label>
            <Select value={risk.stopType} onValueChange={(v) => updateRisk("stopType", v as any)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="atr">ATR</SelectItem>
                <SelectItem value="percentage">Percentual</SelectItem>
                <SelectItem value="fixed">Valor Fixo</SelectItem>
                <SelectItem value="swing_low">Swing Low/High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Valor ({risk.stopType === "atr" ? "multiplicador" : risk.stopType === "percentage" ? "%" : "USD"})
            </Label>
            <Input
              type="number"
              value={risk.stopValue}
              onChange={(e) => updateRisk("stopValue", parseFloat(e.target.value) || 0)}
              step={0.1}
              className="h-9 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Take Profit targets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-foreground">Alvos (Take Profit)</h3>
          <Button size="sm" variant="outline" onClick={addTarget} className="gap-1.5 h-7 text-xs">
            <Plus className="h-3 w-3" /> Alvo
          </Button>
        </div>
        {risk.targets.map((target, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <Input
              value={target.label}
              onChange={(e) => {
                const newTargets = [...risk.targets];
                newTargets[idx] = { ...newTargets[idx], label: e.target.value };
                updateRisk("targets", newTargets);
              }}
              className="h-8 w-20 text-xs"
            />
            <Label className="text-xs text-muted-foreground shrink-0">R/R:</Label>
            <Input
              type="number"
              value={target.rrMultiple}
              onChange={(e) => {
                const newTargets = [...risk.targets];
                newTargets[idx] = { ...newTargets[idx], rrMultiple: parseFloat(e.target.value) || 0 };
                updateRisk("targets", newTargets);
              }}
              step={0.5}
              className="h-8 w-20 font-mono text-xs"
            />
            <button onClick={() => removeTarget(idx)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Trailing */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-foreground">Trailing Stop</h3>
        <div className="flex items-center gap-3">
          <Switch checked={risk.trailingEnabled} onCheckedChange={(v) => updateRisk("trailingEnabled", v)} />
          <span className="text-xs text-muted-foreground">
            {risk.trailingEnabled ? "Ativado" : "Desativado"}
          </span>
        </div>
        {risk.trailingEnabled && (
          <Select value={risk.trailingType} onValueChange={(v) => updateRisk("trailingType", v)}>
            <SelectTrigger className="h-9 text-xs w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atr">Baseado em ATR</SelectItem>
              <SelectItem value="percentage">Percentual</SelectItem>
              <SelectItem value="breakeven">Breakeven após TP1</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Operational filters */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-foreground">Filtros Operacionais</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Spread máx. (%)</Label>
            <Input
              type="number"
              value={risk.maxSpreadPercent}
              onChange={(e) => updateRisk("maxSpreadPercent", parseFloat(e.target.value) || 0)}
              step={0.01}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Liquidez mín. (USD)</Label>
            <Input
              type="number"
              value={risk.minLiquidity}
              onChange={(e) => updateRisk("minLiquidity", parseFloat(e.target.value) || 0)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Slippage esperado (%)</Label>
            <Input
              type="number"
              value={risk.slippageExpected}
              onChange={(e) => updateRisk("slippageExpected", parseFloat(e.target.value) || 0)}
              step={0.01}
              className="h-9 font-mono"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
