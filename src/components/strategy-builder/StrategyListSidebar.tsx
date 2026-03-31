import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Play, Pause, Trash2, Settings2, Copy, Sparkles } from "lucide-react";
import { StrategyPresetsDialog } from "./StrategyPresetsDialog";
import type { FullStrategy } from "@/hooks/use-strategies";
import type { StrategyDraft } from "@/types/strategy";

interface Props {
  strategies: FullStrategy[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onDuplicate?: (id: string) => void;
  onApplyPreset?: (draft: StrategyDraft) => void;
}

export function StrategyListSidebar({
  strategies,
  loading,
  selectedId,
  onSelect,
  onNew,
  onDelete,
  onToggle,
  onDuplicate,
  onApplyPreset,
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = strategies.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-card/30 border-r border-border">
      {/* Header */}
      <div className="p-3 space-y-2 border-b border-border">
        <div className="flex gap-1.5">
          <Button onClick={onNew} size="sm" className="flex-1 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova
          </Button>
          {onApplyPreset && (
            <StrategyPresetsDialog onApply={onApplyPreset}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Preset
              </Button>
            </StrategyPresetsDialog>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Settings2 className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {search ? "Nenhuma estratégia encontrada" : "Nenhuma estratégia criada"}
              </p>
            </div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`w-full text-left rounded-md p-2.5 transition-colors group ${
                  selectedId === s.id
                    ? "bg-primary/10 border border-primary/30"
                    : "hover:bg-accent/50 border border-transparent"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {s.name}
                      </span>
                      <Badge
                        variant={s.active ? "bull" : "secondary"}
                        className="text-[9px] h-4 px-1"
                      >
                        {s.active ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[9px] font-mono h-4 px-1">
                        {s.market === "linear" ? "PERP" : "SPOT"}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {s.indicators.length}ind · {s.conditions.length}cond
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {onDuplicate && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(s.id);
                        }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Duplicar"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(s.id, !s.active);
                      }}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      {s.active ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
