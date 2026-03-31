import { useState, useCallback } from "react";
import { useStrategies, useDeleteStrategy, useToggleStrategy } from "@/hooks/use-strategies";
import { useStrategyDraft, dbToDraft } from "@/hooks/use-strategy-draft";
import { StrategyListSidebar } from "@/components/strategy-builder/StrategyListSidebar";
import { StrategyEditorTabs } from "@/components/strategy-builder/StrategyEditorTabs";
import { StrategyAiPanel } from "@/components/strategy-builder/StrategyAiPanel";
import { StrategyVersionsDialog } from "@/components/strategy-builder/StrategyVersionsDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Bot, X, History } from "lucide-react";
import { toast } from "sonner";
import type { StrategyDraft } from "@/types/strategy";

export default function StrategiesPage() {
  const { data: strategies, isLoading: loadingList } = useStrategies();
  const deleteStrategy = useDeleteStrategy();
  const toggleStrategy = useToggleStrategy();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAi, setShowAi] = useState(false);

  const draftHook = useStrategyDraft(selectedId);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleNew = useCallback(() => {
    setSelectedId(null);
    draftHook.resetDraft();
  }, [draftHook]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteStrategy.mutate(id);
      if (selectedId === id) {
        setSelectedId(null);
        draftHook.resetDraft();
      }
    },
    [deleteStrategy, selectedId, draftHook]
  );

  const handleToggle = useCallback(
    (id: string, active: boolean) => {
      toggleStrategy.mutate({ id, active });
    },
    [toggleStrategy]
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const strategy = strategies?.find((s) => s.id === id);
      if (!strategy) return;

      const duplicated = dbToDraft(
        strategy,
        strategy.indicators,
        strategy.conditions,
        strategy.weights,
        strategy.symbols,
        strategy.timeframes
      );

      // Remove id to create a new one, update name
      draftHook.replaceDraft({
        ...duplicated,
        id: undefined,
        name: `${duplicated.name} (cópia)`,
        version: 1,
      });
      setSelectedId(null);
      toast.info("Estratégia duplicada. Salve para confirmar.");
    },
    [strategies, draftHook]
  );

  const handleApplyPreset = useCallback(
    (preset: StrategyDraft) => {
      setSelectedId(null);
      draftHook.replaceDraft(preset);
      toast.info("Preset aplicado. Edite e salve para confirmar.");
    },
    [draftHook]
  );

  const handleRestoreVersion = useCallback(
    (snapshot: StrategyDraft) => {
      draftHook.replaceDraft({ ...snapshot, id: draftHook.draft.id });
      toast.success("Versão restaurada. Salve para confirmar.");
    },
    [draftHook]
  );

  return (
    <div className="h-[calc(100vh-3.5rem-3.5rem)] md:h-[calc(100vh-3.5rem)] flex flex-col animate-slide-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border bg-card/50 shrink-0 gap-2">
        <div className="min-w-0">
          <h1 className="text-base md:text-lg font-bold text-foreground truncate">Strategy Builder</h1>
          <p className="text-[10px] md:text-xs text-muted-foreground hidden sm:block">Crie e edite estratégias avançadas</p>
        </div>
        <div className="flex items-center gap-2">
          {draftHook.dirty && (
            <span className="text-xs text-yellow-400 font-mono">• Não salvo</span>
          )}
          {draftHook.saving && (
            <span className="text-xs text-muted-foreground font-mono">Salvando...</span>
          )}
          {draftHook.draft.id && (
            <StrategyVersionsDialog
              strategyId={draftHook.draft.id}
              onRestore={handleRestoreVersion}
            >
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                <History className="h-3.5 w-3.5" />
                Versões
              </Button>
            </StrategyVersionsDialog>
          )}
          <Button
            variant={showAi ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAi(!showAi)}
            className="gap-1.5"
          >
            {showAi ? <X className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            {showAi ? "Fechar IA" : "Assistente IA"}
          </Button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Sidebar */}
          <ResizablePanel defaultSize={18} minSize={14} maxSize={28}>
            <StrategyListSidebar
              strategies={strategies || []}
              loading={loadingList}
              selectedId={selectedId}
              onSelect={handleSelect}
              onNew={handleNew}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onDuplicate={handleDuplicate}
              onApplyPreset={handleApplyPreset}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Central Editor */}
          <ResizablePanel defaultSize={showAi ? 52 : 82} minSize={40}>
            <StrategyEditorTabs draftHook={draftHook} />
          </ResizablePanel>

          {/* AI Panel */}
          {showAi && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={30} minSize={22} maxSize={40}>
                <StrategyAiPanel draftHook={draftHook} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
