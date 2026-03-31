import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { CONDITION_OPERATORS } from "@/lib/indicators";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import type { Condition } from "@/types/strategy";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyConditionsEditor({ draftHook }: Props) {
  const { draft, updateDraft, addCondition, removeCondition, addConditionGroup } = draftHook;

  const createCondition = (): Condition => ({
    id: crypto.randomUUID(),
    leftOperand: { type: "indicator", ref: "" },
    operator: ">",
    rightOperand: { type: "value", ref: "", value: 0 },
    role: "required",
    weight: 10,
    enabled: true,
  });

  const updateConditionInGroup = (groupIdx: number, condIdx: number, updates: Partial<Condition>) => {
    const newGroups = draft.conditionGroups.map((g, gi) => {
      if (gi !== groupIdx) return g;
      return {
        ...g,
        conditions: g.conditions.map((c, ci) =>
          ci === condIdx ? { ...c, ...updates } : c
        ),
      };
    });
    updateDraft("conditionGroups", newGroups);
  };

  // Build indicator options for dropdowns
  const indicatorOptions = draft.indicators.map((ind, i) => ({
    value: ind.id || `idx_${i}`,
    label: `${ind.label} (${ind.type})`,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Condições e Regras</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addConditionGroup("AND")}
          className="gap-1.5 h-7 text-xs"
        >
          <Plus className="h-3 w-3" /> Grupo
        </Button>
      </div>

      {draft.conditionGroups.map((group, gi) => (
        <div key={group.id} className="border border-border rounded-lg bg-card/30 p-3 space-y-3">
          {/* Group header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">
                Grupo {gi + 1}
              </Badge>
              <Select
                value={group.logic}
                onValueChange={(v) => {
                  const newGroups = [...draft.conditionGroups];
                  newGroups[gi] = { ...newGroups[gi], logic: v as "AND" | "OR" };
                  updateDraft("conditionGroups", newGroups);
                }}
              >
                <SelectTrigger className="h-6 w-20 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addCondition(gi, createCondition())}
                className="h-6 text-[10px] gap-1 px-2"
              >
                <Plus className="h-2.5 w-2.5" /> Condição
              </Button>
              {draft.conditionGroups.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    updateDraft(
                      "conditionGroups",
                      draft.conditionGroups.filter((_, i) => i !== gi)
                    )
                  }
                  className="h-6 text-[10px] px-2 text-destructive"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Conditions */}
          {group.conditions.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              Nenhuma condição. Clique em "+ Condição" para adicionar.
            </p>
          ) : (
            group.conditions.map((cond, ci) => (
              <div
                key={cond.id}
                className="flex items-center gap-2 p-2 rounded bg-background/50 border border-border/50"
              >
                <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab shrink-0" />

                {/* Left operand */}
                <div className="flex-1 min-w-0">
                  <Select
                    value={cond.leftOperand.ref}
                    onValueChange={(v) =>
                      updateConditionInGroup(gi, ci, {
                        leftOperand: { ...cond.leftOperand, ref: v },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-[10px]">
                      <SelectValue placeholder="Indicador..." />
                    </SelectTrigger>
                    <SelectContent>
                      {indicatorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="price.close">Preço (Close)</SelectItem>
                      <SelectItem value="price.high">Preço (High)</SelectItem>
                      <SelectItem value="price.low">Preço (Low)</SelectItem>
                      <SelectItem value="volume">Volume</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Operator */}
                <Select
                  value={cond.operator}
                  onValueChange={(v) => updateConditionInGroup(gi, ci, { operator: v })}
                >
                  <SelectTrigger className="h-7 w-28 text-[10px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Right operand */}
                <div className="flex-1 min-w-0">
                  <Select
                    value={cond.rightOperand.type}
                    onValueChange={(v) =>
                      updateConditionInGroup(gi, ci, {
                        rightOperand: { ...cond.rightOperand, type: v as any },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="value">Valor fixo</SelectItem>
                      <SelectItem value="indicator">Indicador</SelectItem>
                      <SelectItem value="multiplier">Multiplicador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {cond.rightOperand.type === "value" || cond.rightOperand.type === "multiplier" ? (
                  <Input
                    type="number"
                    value={cond.rightOperand.value ?? 0}
                    onChange={(e) =>
                      updateConditionInGroup(gi, ci, {
                        rightOperand: { ...cond.rightOperand, value: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="h-7 w-20 text-[10px] font-mono shrink-0"
                  />
                ) : (
                  <Select
                    value={cond.rightOperand.ref}
                    onValueChange={(v) =>
                      updateConditionInGroup(gi, ci, {
                        rightOperand: { ...cond.rightOperand, ref: v },
                      })
                    }
                  >
                    <SelectTrigger className="h-7 w-32 text-[10px] shrink-0">
                      <SelectValue placeholder="Indicador..." />
                    </SelectTrigger>
                    <SelectContent>
                      {indicatorOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Role badge */}
                <Select
                  value={cond.role}
                  onValueChange={(v) => updateConditionInGroup(gi, ci, { role: v as any })}
                >
                  <SelectTrigger className="h-7 w-24 text-[10px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Obrigatório</SelectItem>
                    <SelectItem value="score">Score</SelectItem>
                    <SelectItem value="informative">Info</SelectItem>
                  </SelectContent>
                </Select>

                {/* Delete */}
                <button
                  onClick={() => removeCondition(gi, ci)}
                  className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}

          {/* Show logic connector between conditions */}
          {group.conditions.length > 1 && (
            <div className="text-center">
              <Badge variant="outline" className="text-[9px] font-mono">
                {group.logic}
              </Badge>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
