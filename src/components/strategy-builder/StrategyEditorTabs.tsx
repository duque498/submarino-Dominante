import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Save, Settings2 } from "lucide-react";
import { StrategyGeneralForm } from "./StrategyGeneralForm";
import { StrategyMarketForm } from "./StrategyMarketForm";
import { StrategyIndicatorsEditor } from "./StrategyIndicatorsEditor";
import { StrategyConditionsEditor } from "./StrategyConditionsEditor";
import { StrategyScoreEditor } from "./StrategyScoreEditor";
import { StrategyRiskEditor } from "./StrategyRiskEditor";
import { StrategyAlertsEditor } from "./StrategyAlertsEditor";
import { StrategyPreviewPanel } from "./StrategyPreviewPanel";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyEditorTabs({ draftHook }: Props) {
  const { draft, saving, dirty, saveDraft, loading } = draftHook;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs defaultValue="general" className="flex-1 flex flex-col">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
          <TabsList className="bg-transparent h-8 gap-0.5">
            <TabsTrigger value="general" className="text-xs h-7 px-2.5">Geral</TabsTrigger>
            <TabsTrigger value="market" className="text-xs h-7 px-2.5">Mercado</TabsTrigger>
            <TabsTrigger value="indicators" className="text-xs h-7 px-2.5">Indicadores</TabsTrigger>
            <TabsTrigger value="conditions" className="text-xs h-7 px-2.5">Condições</TabsTrigger>
            <TabsTrigger value="score" className="text-xs h-7 px-2.5">Score</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs h-7 px-2.5">Risco</TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs h-7 px-2.5">Alertas</TabsTrigger>
            <TabsTrigger value="preview" className="text-xs h-7 px-2.5">Preview</TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            onClick={saveDraft}
            disabled={saving || !draft.name.trim()}
            className="gap-1.5 h-7 text-xs"
          >
            <Save className="h-3 w-3" />
            {saving ? "Salvando..." : dirty ? "Salvar *" : "Salvar"}
          </Button>
        </div>

        {/* Tab contents */}
        <ScrollArea className="flex-1">
          <div className="p-4 max-w-4xl">
            <TabsContent value="general" className="mt-0">
              <StrategyGeneralForm draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="market" className="mt-0">
              <StrategyMarketForm draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="indicators" className="mt-0">
              <StrategyIndicatorsEditor draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="conditions" className="mt-0">
              <StrategyConditionsEditor draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="score" className="mt-0">
              <StrategyScoreEditor draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="risk" className="mt-0">
              <StrategyRiskEditor draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="alerts" className="mt-0">
              <StrategyAlertsEditor draftHook={draftHook} />
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              <StrategyPreviewPanel draftHook={draftHook} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
