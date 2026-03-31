import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import type { AlertRules } from "@/types/strategy";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyAlertsEditor({ draftHook }: Props) {
  const { draft, updateDraft } = draftHook;
  const alerts = draft.alertRules;

  const updateAlert = <K extends keyof AlertRules>(key: K, value: AlertRules[K]) => {
    updateDraft("alertRules", { ...alerts, [key]: value });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold text-foreground">Configuração de Alertas</h2>

      {/* Score min for alert */}
      <div className="space-y-1.5">
        <Label className="text-xs">Score mínimo para alertar: {alerts.scoreMinForAlert}</Label>
        <Slider
          value={[alerts.scoreMinForAlert]}
          onValueChange={([v]) => updateAlert("scoreMinForAlert", v)}
          min={0}
          max={100}
          step={5}
        />
      </div>

      {/* Priority */}
      <div className="space-y-1.5">
        <Label className="text-xs">Prioridade do Alerta</Label>
        <Select value={alerts.priority} onValueChange={(v) => updateAlert("priority", v as any)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cooldown */}
      <div className="space-y-1.5">
        <Label className="text-xs">Cooldown (minutos)</Label>
        <Input
          type="number"
          value={alerts.cooldownMinutes}
          onChange={(e) => updateAlert("cooldownMinutes", parseInt(e.target.value) || 0)}
          min={0}
          className="h-9 font-mono"
        />
      </div>

      {/* Deduplication */}
      <div className="flex items-center gap-3">
        <Switch checked={alerts.deduplication} onCheckedChange={(v) => updateAlert("deduplication", v)} />
        <div>
          <Label className="text-xs">Deduplicação</Label>
          <p className="text-[10px] text-muted-foreground">Evitar alertas duplicados para o mesmo sinal</p>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="space-y-2">
        <Label className="text-xs">Quiet Hours</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Início</Label>
            <Input
              type="time"
              value={alerts.quietHoursStart || ""}
              onChange={(e) => updateAlert("quietHoursStart", e.target.value || null)}
              className="h-9 font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Fim</Label>
            <Input
              type="time"
              value={alerts.quietHoursEnd || ""}
              onChange={(e) => updateAlert("quietHoursEnd", e.target.value || null)}
              className="h-9 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Custom Message */}
      <div className="space-y-1.5">
        <Label className="text-xs">Mensagem Personalizada</Label>
        <Textarea
          value={alerts.customMessage || ""}
          onChange={(e) => updateAlert("customMessage", e.target.value || null)}
          placeholder="Ex: {{symbol}} score {{score}} — {{direction}} em {{timeframe}}"
          rows={2}
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Variáveis: {"{{symbol}}"}, {"{{score}}"}, {"{{direction}}"}, {"{{timeframe}}"}, {"{{rr}}"}
        </p>
      </div>
    </div>
  );
}
