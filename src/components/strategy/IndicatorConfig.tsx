import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDICATOR_CATALOG, INDICATOR_CATEGORIES, getIndicatorDef, getDefaultParams, type IndicatorDef } from "@/lib/indicators";
import { useAddIndicator, useRemoveIndicator } from "@/hooks/use-strategies";
import { Plus, Trash2, Settings2, TrendingUp, Zap, BarChart3, Activity, Layers } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const categoryIcons: Record<string, React.ReactNode> = {
  trend: <TrendingUp className="h-3.5 w-3.5" />,
  momentum: <Zap className="h-3.5 w-3.5" />,
  volume: <BarChart3 className="h-3.5 w-3.5" />,
  volatility: <Activity className="h-3.5 w-3.5" />,
  structure: <Layers className="h-3.5 w-3.5" />,
};

interface IndicatorConfigProps {
  strategyId: string;
  indicators: Tables<"strategy_indicators">[];
}

export function IndicatorConfig({ strategyId, indicators }: IndicatorConfigProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [params, setParams] = useState<Record<string, number | string>>({});
  const [role, setRole] = useState<string>("required");
  const [weight, setWeight] = useState(10);

  const addIndicator = useAddIndicator();
  const removeIndicator = useRemoveIndicator();

  const selectIndicator = (type: string) => {
    setSelectedType(type);
    setParams(getDefaultParams(type));
  };

  const handleAdd = () => {
    if (!selectedType) return;
    addIndicator.mutate(
      {
        strategy_id: strategyId,
        indicator_type: selectedType,
        params: params as any,
        role,
        weight,
        sort_order: indicators.length,
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setSelectedType("");
          setParams({});
        },
      }
    );
  };

  const def = selectedType ? getIndicatorDef(selectedType) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Indicadores</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {indicators.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground py-3 text-center">
          Nenhum indicador configurado. Adicione indicadores para definir a análise.
        </p>
      )}

      <div className="space-y-2">
        {indicators.map((ind) => {
          const indDef = getIndicatorDef(ind.indicator_type);
          const catDef = INDICATOR_CATEGORIES.find((c) => c.key === indDef?.category);
          return (
            <div
              key={ind.id}
              className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {indDef && categoryIcons[indDef.category]}
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {indDef?.label || ind.indicator_type}
                  </span>
                  <span className="ml-2 text-[10px] text-muted-foreground font-mono">
                    {Object.entries((ind.params as Record<string, any>) || {})
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {ind.role === "required" ? "Obrigatório" : "Opcional"}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  Peso: {ind.weight}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeIndicator.mutate(ind.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Tipo de Indicador</Label>
            <div className="space-y-2">
              {INDICATOR_CATEGORIES.map((cat) => {
                const catIndicators = INDICATOR_CATALOG.filter((i) => i.category === cat.key);
                if (catIndicators.length === 0) return null;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {categoryIcons[cat.key]}
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {cat.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {catIndicators.map((ind) => (
                        <button
                          key={ind.type}
                          onClick={() => selectIndicator(ind.type)}
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            selectedType === ind.type
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {ind.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {def && (
            <>
              <p className="text-[10px] text-muted-foreground">{def.description}</p>
              <div className="grid grid-cols-2 gap-3">
                {def.params.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <Label className="text-[10px]">{p.label}</Label>
                    {p.type === "number" ? (
                      <Input
                        type="number"
                        min={p.min}
                        max={p.max}
                        step={p.step || 1}
                        value={params[p.name] ?? p.default}
                        onChange={(e) => setParams({ ...params, [p.name]: Number(e.target.value) })}
                        className="h-8 text-xs"
                      />
                    ) : (
                      <Select
                        value={String(params[p.name] ?? p.default)}
                        onValueChange={(v) => setParams({ ...params, [p.name]: v })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {p.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px]">Papel</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="required">Obrigatório</SelectItem>
                      <SelectItem value="optional">Opcional (bônus)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Peso</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={addIndicator.isPending}>
                  Adicionar Indicador
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
