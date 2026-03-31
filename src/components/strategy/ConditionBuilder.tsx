import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddCondition, useRemoveCondition } from "@/hooks/use-strategies";
import { Plus, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getIndicatorDef } from "@/lib/indicators";

const OPERATORS = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "eq", label: "=" },
  { value: "crosses_above", label: "Cruza acima" },
  { value: "crosses_below", label: "Cruza abaixo" },
  { value: "between", label: "Entre" },
];

const CONDITION_TYPES = [
  { value: "indicator_value", label: "Valor do indicador" },
  { value: "indicator_cross", label: "Cruzamento de indicadores" },
  { value: "price_level", label: "Nível de preço" },
  { value: "volume_condition", label: "Condição de volume" },
  { value: "candle_pattern", label: "Padrão de candle" },
];

interface ConditionBuilderProps {
  strategyId: string;
  conditions: Tables<"strategy_conditions">[];
  indicators: Tables<"strategy_indicators">[];
}

export function ConditionBuilder({ strategyId, conditions, indicators }: ConditionBuilderProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [conditionType, setConditionType] = useState("indicator_value");
  const [indicatorId, setIndicatorId] = useState<string>("");
  const [operator, setOperator] = useState("gt");
  const [value, setValue] = useState("0");
  const [role, setRole] = useState("required");
  const [logicGroup, setLogicGroup] = useState("AND");

  const addCondition = useAddCondition();
  const removeCondition = useRemoveCondition();

  const handleAdd = () => {
    addCondition.mutate(
      {
        strategy_id: strategyId,
        condition_type: conditionType,
        indicator_id: indicatorId || null,
        operator,
        value: conditionType === "indicator_value" ? Number(value) : value,
        role,
        logic_group: logicGroup,
        sort_order: conditions.length,
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setValue("0");
        },
      }
    );
  };

  const getConditionLabel = (c: Tables<"strategy_conditions">) => {
    const ind = indicators.find((i) => i.id === c.indicator_id);
    const indDef = ind ? getIndicatorDef(ind.indicator_type) : null;
    const opLabel = OPERATORS.find((o) => o.value === c.operator)?.label || c.operator;
    return `${indDef?.label || c.condition_type} ${opLabel} ${JSON.stringify(c.value)}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Condições de Entrada</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {conditions.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground py-3 text-center">
          Nenhuma condição definida. Adicione condições para gerar sinais.
        </p>
      )}

      <div className="space-y-2">
        {conditions.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2">
            {i > 0 && (
              <Badge variant="outline" className="text-[9px] shrink-0">
                {c.logic_group || "AND"}
              </Badge>
            )}
            <div className="flex-1 flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <span className="text-xs text-foreground">{getConditionLabel(c)}</span>
              <div className="flex items-center gap-2">
                <Badge variant={c.role === "required" ? "default" : "secondary"} className="text-[10px]">
                  {c.role === "required" ? "Obrig." : "Bônus"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeCondition.mutate(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Tipo</Label>
              <Select value={conditionType} onValueChange={setConditionType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Indicador</Label>
              <Select value={indicatorId} onValueChange={setIndicatorId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {indicators.map((ind) => {
                    const def = getIndicatorDef(ind.indicator_type);
                    return (
                      <SelectItem key={ind.id} value={ind.id}>
                        {def?.label || ind.indicator_type}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Operador</Label>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Valor</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Lógica</Label>
              <Select value={logicGroup} onValueChange={setLogicGroup}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">AND</SelectItem>
                  <SelectItem value="OR">OR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={addCondition.isPending}>
              Adicionar Condição
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
