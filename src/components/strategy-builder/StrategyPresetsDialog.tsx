import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Shield, Gauge, Zap } from "lucide-react";
import { STRATEGY_PRESETS, applyPreset, type StrategyPreset } from "@/lib/strategy-presets";
import { useState } from "react";

interface Props {
  onApply: (draft: ReturnType<typeof applyPreset>) => void;
  children: React.ReactNode;
}

const profileConfig = {
  conservador: { icon: Shield, color: "text-green-400", bg: "bg-green-400/10 border-green-400/20" },
  moderado: { icon: Gauge, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/20" },
  agressivo: { icon: Zap, color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
};

export function StrategyPresetsDialog({ onApply, children }: Props) {
  const [open, setOpen] = useState(false);

  const handleApply = (preset: StrategyPreset) => {
    onApply(applyPreset(preset));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Presets de Estratégia
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {STRATEGY_PRESETS.map((preset) => {
            const config = profileConfig[preset.profile];
            const Icon = config.icon;
            return (
              <button
                key={preset.id}
                onClick={() => handleApply(preset)}
                className={`w-full text-left p-3 rounded-lg border transition-colors hover:bg-accent/50 ${config.bg}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-md bg-background/50 ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{preset.label}</span>
                      <Badge variant="outline" className="text-[9px] h-4 capitalize">{preset.profile}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                    <div className="flex gap-2 mt-1.5 text-[10px] text-muted-foreground font-mono">
                      <span>{preset.draft.indicators?.length || 0} indicadores</span>
                      <span>·</span>
                      <span>Score ≥{preset.draft.scoreMin}</span>
                      <span>·</span>
                      <span>RR ≥{preset.draft.minRr}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
