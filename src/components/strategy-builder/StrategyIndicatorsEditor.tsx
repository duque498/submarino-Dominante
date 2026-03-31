import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Trash2, ChevronDown, GripVertical, Eye, EyeOff } from "lucide-react";
import { INDICATOR_CATALOG, INDICATOR_CATEGORIES, getIndicatorDef } from "@/lib/indicators";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import { useState } from "react";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyIndicatorsEditor({ draftHook }: Props) {
  const { draft, addIndicator, removeIndicator, updateIndicator } = draftHook;
  const [showCatalog, setShowCatalog] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const filteredCatalog = filterCategory
    ? INDICATOR_CATALOG.filter((i) => i.category === filterCategory)
    : INDICATOR_CATALOG;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Indicadores ({draft.indicators.length})
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowCatalog(!showCatalog)} className="gap-1.5 h-7 text-xs">
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </div>

      {/* Catalog */}
      {showCatalog && (
        <div className="border border-border rounded-lg p-3 bg-card/50 space-y-3">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilterCategory(null)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                !filterCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              Todos
            </button>
            {INDICATOR_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setFilterCategory(cat.key)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  filterCategory === cat.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {filteredCatalog.map((ind) => (
              <button
                key={ind.type}
                onClick={() => {
                  addIndicator(ind.type);
                  setShowCatalog(false);
                }}
                className="text-left p-2 rounded border border-border hover:border-primary/30 hover:bg-accent/30 transition-colors"
              >
                <div className="text-xs font-semibold text-foreground">{ind.label}</div>
                <div className="text-[10px] text-muted-foreground">{ind.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Indicator list */}
      {draft.indicators.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-xs">
          Nenhum indicador adicionado. Clique em "Adicionar" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {draft.indicators.map((ind, idx) => {
            const def = getIndicatorDef(ind.type);
            return (
              <Collapsible key={idx}>
                <div className="border border-border rounded-lg bg-card/30">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-accent/20 transition-colors">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">{ind.label}</span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1">{ind.type}</Badge>
                          <Badge
                            variant={ind.role === "required" ? "default" : ind.role === "score" ? "secondary" : "outline"}
                            className="text-[9px] h-4 px-1"
                          >
                            {ind.role === "required" ? "Obrigatório" : ind.role === "score" ? "Score" : "Info"}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {Object.entries(ind.params).map(([k, v]) => `${k}=${v}`).join(", ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); updateIndicator(idx, { plotOnChart: !ind.plotOnChart }); }}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          {ind.plotOnChart ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </button>
                        <Switch
                          checked={ind.enabled}
                          onCheckedChange={(v) => updateIndicator(idx, { enabled: v })}
                          className="scale-75"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeIndicator(idx); }}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 pt-0 space-y-3 border-t border-border">
                      {/* Label */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Label</Label>
                        <Input
                          value={ind.label}
                          onChange={(e) => updateIndicator(idx, { label: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </div>

                      {/* Params */}
                      {def?.params.map((p) => (
                        <div key={p.name} className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{p.label}</Label>
                          {p.type === "select" ? (
                            <Select
                              value={String(ind.params[p.name] ?? p.default)}
                              onValueChange={(v) =>
                                updateIndicator(idx, {
                                  params: { ...ind.params, [p.name]: v },
                                })
                              }
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {p.options?.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type="number"
                              value={ind.params[p.name] ?? p.default}
                              onChange={(e) =>
                                updateIndicator(idx, {
                                  params: { ...ind.params, [p.name]: parseFloat(e.target.value) || 0 },
                                })
                              }
                              min={p.min}
                              max={p.max}
                              step={p.step}
                              className="h-7 text-xs font-mono"
                            />
                          )}
                        </div>
                      ))}

                      {/* Role & Weight */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Papel</Label>
                          <Select
                            value={ind.role}
                            onValueChange={(v) => updateIndicator(idx, { role: v as any })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="required">Obrigatório</SelectItem>
                              <SelectItem value="score">Score</SelectItem>
                              <SelectItem value="informative">Informativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Peso</Label>
                          <Input
                            type="number"
                            value={ind.weight}
                            onChange={(e) => updateIndicator(idx, { weight: parseInt(e.target.value) || 0 })}
                            min={0}
                            max={100}
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
