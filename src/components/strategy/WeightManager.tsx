import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { SCORE_BLOCKS } from "@/lib/scoring";
import { useSaveWeights } from "@/hooks/use-strategies";
import { Save } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface WeightManagerProps {
  strategyId: string;
  weights: Tables<"strategy_weights">[];
}

export function WeightManager({ strategyId, weights }: WeightManagerProps) {
  const [localWeights, setLocalWeights] = useState<Record<string, number>>({});
  const saveWeights = useSaveWeights();

  useEffect(() => {
    const initial: Record<string, number> = {};
    SCORE_BLOCKS.forEach((block) => {
      const saved = weights.find((w) => w.block_name === block.name);
      initial[block.name] = saved ? saved.weight : block.defaultWeight;
    });
    setLocalWeights(initial);
  }, [weights]);

  const totalWeight = Object.values(localWeights).reduce((s, w) => s + w, 0);

  const handleSave = () => {
    saveWeights.mutate({
      strategyId,
      weights: Object.entries(localWeights).map(([block_name, weight]) => ({ block_name, weight })),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Pesos do Score</h3>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${totalWeight === 100 ? "text-bull" : "text-bear"}`}>
            Total: {totalWeight}%
          </span>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={saveWeights.isPending}>
            <Save className="mr-1 h-3.5 w-3.5" /> Salvar
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {SCORE_BLOCKS.map((block) => (
          <div key={block.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-foreground">{block.label}</span>
                <p className="text-[10px] text-muted-foreground">{block.description}</p>
              </div>
              <span className="font-mono text-sm font-semibold text-primary">
                {localWeights[block.name] || 0}%
              </span>
            </div>
            <Slider
              value={[localWeights[block.name] || 0]}
              onValueChange={([v]) => setLocalWeights({ ...localWeights, [block.name]: v })}
              max={100}
              step={5}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {totalWeight !== 100 && (
        <p className="text-xs text-bear">
          ⚠ Os pesos devem somar 100%. Atualmente: {totalWeight}%
        </p>
      )}
    </div>
  );
}
