import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useStrategy } from "@/hooks/use-strategies";
import { IndicatorConfig } from "./IndicatorConfig";
import { ConditionBuilder } from "./ConditionBuilder";
import { WeightManager } from "./WeightManager";

interface StrategyDetailProps {
  strategyId: string;
  open: boolean;
  onClose: () => void;
}

export function StrategyDetail({ strategyId, open, onClose }: StrategyDetailProps) {
  const { data: strategy, isLoading } = useStrategy(open ? strategyId : null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {isLoading || !strategy ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{strategy.name}</DialogTitle>
                <Badge variant={strategy.active ? "bull" : "secondary"}>
                  {strategy.active ? "Ativa" : "Pausada"}
                </Badge>
              </div>
              {strategy.description && (
                <p className="text-xs text-muted-foreground">{strategy.description}</p>
              )}
            </DialogHeader>

            <div className="flex flex-wrap gap-1.5 mt-1">
              <Badge variant="outline" className="text-[10px] font-mono">
                {strategy.market === "linear" ? "PERP" : "SPOT"}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                Score ≥ {strategy.score_min}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                R/R ≥ {strategy.min_rr}
              </Badge>
              {strategy.symbols.map((s) => (
                <Badge key={s.id} variant="secondary" className="text-[10px] font-mono">
                  {s.symbol}
                </Badge>
              ))}
              {strategy.timeframes.map((tf) => (
                <Badge key={tf.id} variant="secondary" className="text-[10px] font-mono">
                  {tf.timeframe}
                </Badge>
              ))}
            </div>

            <Tabs defaultValue="indicators" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="indicators" className="text-xs">
                  Indicadores ({strategy.indicators.length})
                </TabsTrigger>
                <TabsTrigger value="conditions" className="text-xs">
                  Condições ({strategy.conditions.length})
                </TabsTrigger>
                <TabsTrigger value="weights" className="text-xs">
                  Pesos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="indicators" className="mt-4">
                <IndicatorConfig
                  strategyId={strategy.id}
                  indicators={strategy.indicators}
                />
              </TabsContent>

              <TabsContent value="conditions" className="mt-4">
                <ConditionBuilder
                  strategyId={strategy.id}
                  conditions={strategy.conditions}
                  indicators={strategy.indicators}
                />
              </TabsContent>

              <TabsContent value="weights" className="mt-4">
                <WeightManager
                  strategyId={strategy.id}
                  weights={strategy.weights}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
