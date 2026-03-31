import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Play, Pause, Copy, Pencil, Trash2, Settings2 } from "lucide-react";
import { useStrategies, useToggleStrategy, useDeleteStrategy } from "@/hooks/use-strategies";
import { StrategyForm } from "@/components/strategy/StrategyForm";
import { StrategyDetail } from "@/components/strategy/StrategyDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function StrategiesPage() {
  const { data: strategies, isLoading } = useStrategies();
  const toggleStrategy = useToggleStrategy();
  const deleteStrategy = useDeleteStrategy();

  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estratégias</h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie suas estratégias de análise</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova Estratégia
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !strategies || strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma estratégia criada</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Crie sua primeira estratégia definindo indicadores, condições de entrada e pesos do scoring.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Criar Estratégia
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <div key={s.id} className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className="font-semibold text-foreground hover:text-primary transition-colors text-left"
                    >
                      {s.name}
                    </button>
                    <Badge variant={s.active ? "bull" : "secondary"}>
                      {s.active ? "Ativa" : "Pausada"}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {s.market === "linear" ? "PERP" : "SPOT"}
                    </Badge>
                    {s.symbols.map((sym) => (
                      <Badge key={sym.id} variant="secondary" className="font-mono text-[10px]">
                        {sym.symbol}
                      </Badge>
                    ))}
                    {s.timeframes.map((tf) => (
                      <Badge key={tf.id} variant="secondary" className="font-mono text-[10px]">
                        {tf.timeframe}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Score ≥ <strong className="text-foreground font-mono">{s.score_min}</strong></span>
                    <span>R/R ≥ <strong className="text-foreground font-mono">{s.min_rr}</strong></span>
                    <span>Indicadores: <strong className="text-foreground font-mono">{s.indicators.length}</strong></span>
                    <span>Condições: <strong className="text-foreground font-mono">{s.conditions.length}</strong></span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleStrategy.mutate({ id: s.id, active: !s.active })}
                    >
                      {s.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedId(s.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <StrategyForm open={showForm} onClose={() => setShowForm(false)} />

      {/* Detail/edit dialog */}
      {selectedId && (
        <StrategyDetail
          strategyId={selectedId}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Estratégia</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Todos os indicadores, condições e pesos serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteStrategy.mutate(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
