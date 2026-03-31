import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { X } from "lucide-react";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import { useState } from "react";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyGeneralForm({ draftHook }: Props) {
  const { draft, updateDraft } = draftHook;
  const [tagInput, setTagInput] = useState("");

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !draft.tags.includes(tag)) {
      updateDraft("tags", [...draft.tags, tag]);
    }
    setTagInput("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-4">Informações Gerais</h2>
        <div className="grid gap-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nome da Estratégia *</Label>
            <Input
              value={draft.name}
              onChange={(e) => updateDraft("name", e.target.value)}
              placeholder="Ex: Scalp BTC Rompimento 5m"
              className="h-9"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => updateDraft("description", e.target.value)}
              placeholder="Descreva a lógica da estratégia..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Direction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Direção Permitida</Label>
              <Select
                value={draft.direction}
                onValueChange={(v) => updateDraft("direction", v as any)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Long & Short</SelectItem>
                  <SelectItem value="long">Somente Long</SelectItem>
                  <SelectItem value="short">Somente Short</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => updateDraft("priority", v as any)}
              >
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
          </div>

          {/* Score Min + Min RR */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Score Mínimo: {draft.scoreMin}</Label>
              <Slider
                value={[draft.scoreMin]}
                onValueChange={([v]) => updateDraft("scoreMin", v)}
                min={0}
                max={100}
                step={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">R/R Mínimo</Label>
              <Input
                type="number"
                value={draft.minRr}
                onChange={(e) => updateDraft("minRr", parseFloat(e.target.value) || 0)}
                min={0}
                step={0.1}
                className="h-9 font-mono"
              />
            </div>
          </div>

          {/* Alert Mode + Active */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Modo de Alerta</Label>
              <Select
                value={draft.alertMode}
                onValueChange={(v) => updateDraft("alertMode", v as any)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="candle_close">Candle Fechado</SelectItem>
                  <SelectItem value="intrabar">Intrabar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={draft.active}
                  onCheckedChange={(v) => updateDraft("active", v)}
                />
                <span className="text-xs text-muted-foreground">
                  {draft.active ? "Ativa" : "Pausada"}
                </span>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {draft.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] gap-1">
                  {tag}
                  <button onClick={() => updateDraft("tags", draft.tags.filter((t) => t !== tag))}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
              placeholder="Adicionar tag (Enter)"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
