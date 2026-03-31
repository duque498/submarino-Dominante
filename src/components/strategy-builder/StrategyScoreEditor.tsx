import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";

const SCORE_BLOCKS = [
  { key: "backtest", label: "Backtest / Histórico", description: "Performance histórica da estratégia" },
  { key: "confluence", label: "Confluência", description: "Alinhamento entre indicadores" },
  { key: "volume", label: "Volume e Liquidez", description: "Volume e profundidade do book" },
  { key: "spread", label: "Spread", description: "Custo de execução estimado" },
  { key: "trend", label: "Tendência (HTF)", description: "Tendência do timeframe maior" },
  { key: "risk_reward", label: "Risco/Retorno", description: "Qualidade do R/R do setup" },
  { key: "derivatives", label: "Contexto Derivativo", description: "OI, funding, liquidações" },
];

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyScoreEditor({ draftHook }: Props) {
  const { draft, updateDraft } = draftHook;
  const total = Object.values(draft.scoreWeights).reduce((a, b) => a + b, 0);

  const updateWeight = (key: string, value: number) => {
    updateDraft("scoreWeights", { ...draft.scoreWeights, [key]: value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pesos do Score</h2>
        <span className={`text-xs font-mono ${total === 100 ? "text-green-400" : "text-yellow-400"}`}>
          Total: {total}%
        </span>
      </div>

      <div className="space-y-4">
        {SCORE_BLOCKS.map((block) => (
          <div key={block.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">{block.label}</Label>
                <p className="text-[10px] text-muted-foreground">{block.description}</p>
              </div>
              <span className="text-xs font-mono text-foreground w-10 text-right">
                {draft.scoreWeights[block.key] ?? 0}%
              </span>
            </div>
            <Slider
              value={[draft.scoreWeights[block.key] ?? 0]}
              onValueChange={([v]) => updateWeight(block.key, v)}
              min={0}
              max={100}
              step={5}
            />
          </div>
        ))}
      </div>

      {/* Score preview */}
      <div className="border border-border rounded-lg p-3 bg-card/30 space-y-2">
        <h3 className="text-xs font-semibold text-foreground">Preview do Score</h3>
        <div className="space-y-1">
          {SCORE_BLOCKS.map((block) => {
            const w = draft.scoreWeights[block.key] ?? 0;
            return (
              <div key={block.key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-32 truncate">{block.label}</span>
                <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{w}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
