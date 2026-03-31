import { useState, useCallback } from "react";
import { useStrategies, useDeleteStrategy, useToggleStrategy } from "@/hooks/use-strategies";
import { useStrategyDraft } from "@/hooks/use-strategy-draft";
import { StrategyListSidebar } from "@/components/strategy-builder/StrategyListSidebar";
import { StrategyEditorTabs } from "@/components/strategy-builder/StrategyEditorTabs";
import { StrategyAiPanel } from "@/components/strategy-builder/StrategyAiPanel";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Bot, X } from "lucide-react";

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

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col animate-slide-in">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-foreground">Strategy Builder</h1>
          <p className="text-xs text-muted-foreground">Crie e edite estratégias avançadas</p>
        </div>
        <div className="flex items-center gap-2">
          {draftHook.dirty && (
            <span className="text-xs text-yellow-400 font-mono">• Não salvo</span>
          )}
          {draftHook.saving && (
            <span className="text-xs text-muted-foreground font-mono">Salvando...</span>
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
