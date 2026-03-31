import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Sparkles, Loader2, Check, X, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";
import type { StrategyDraft } from "@/types/strategy";
import { createEmptyDraft } from "@/types/strategy";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  strategyProposal?: Partial<StrategyDraft>;
}

const QUICK_ACTIONS = [
  { label: "Scalp BTC 5m", prompt: "Crie uma estratégia de scalp para BTCUSDT em 5m com EMA 9, EMA 21, RSI 14 e volume" },
  { label: "Swing ETH 4H", prompt: "Crie uma estratégia de swing trade para ETHUSDT em 4H usando MACD, ADX e Bollinger Bands" },
  { label: "Rompimento multi-ativo", prompt: "Crie uma estratégia de rompimento para BTCUSDT, ETHUSDT e SOLUSDT em 15m com volume acima da média" },
  { label: "Explicar estratégia", prompt: "Explique essa estratégia em linguagem simples" },
  { label: "Sugerir melhorias", prompt: "Analise essa estratégia e sugira melhorias" },
  { label: "Versão conservadora", prompt: "Faça uma versão mais conservadora dessa estratégia" },
];

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyAiPanel({ draftHook }: Props) {
  const { draft, replaceDraft, updateDraft } = draftHook;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<Partial<StrategyDraft> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const determineAction = (text: string, hasDraft: boolean): string => {
    const lower = text.toLowerCase();
    if (lower.includes("expli")) return "explain";
    if (lower.includes("sugir") || lower.includes("melhori")) return "suggest";
    if (hasDraft && draft.indicators.length > 0) return "edit";
    return "create";
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const action = determineAction(text, !!draft.id);
      const chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("strategy-ai", {
        body: {
          action,
          prompt: text.trim(),
          currentStrategy: draft.id || draft.indicators.length > 0 ? draft : undefined,
          messages: chatHistory,
        },
      });

      if (error) throw error;

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${data.error}` },
        ]);
        return;
      }

      if (data.type === "strategy" && data.strategy) {
        setPendingProposal(data.strategy);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.explanation || "Estratégia gerada. Revise as mudanças abaixo e clique em 'Aplicar' para atualizar o builder.",
            strategyProposal: data.strategy,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.content || "Sem resposta." },
        ]);
      }
    } catch (e: any) {
      console.error("AI error:", e);
      const errMsg = e?.message || "Erro ao comunicar com o assistente";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${errMsg}` },
      ]);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const applyProposal = (proposal: Partial<StrategyDraft>) => {
    // Merge proposal into current draft
    const base = draft.id ? { ...draft } : createEmptyDraft();
    const merged: StrategyDraft = {
      ...base,
      ...proposal,
      // Preserve ID and version
      id: draft.id,
      version: draft.version,
      exchange: "bybit",
      active: draft.active,
      // Merge arrays properly — replace if provided
      indicators: proposal.indicators?.map((ind: any) => ({
        type: ind.type,
        label: ind.label || ind.type.toUpperCase(),
        params: ind.params || {},
        source: ind.source || "close",
        timeframe: ind.timeframe || null,
        role: ind.role || "required",
        weight: ind.weight ?? 10,
        enabled: ind.enabled ?? true,
        plotOnChart: ind.plotOnChart ?? true,
      })) || base.indicators,
      conditionGroups: proposal.conditionGroups?.map((g: any) => ({
        id: crypto.randomUUID(),
        logic: g.logic || "AND",
        conditions: (g.conditions || []).map((c: any) => ({
          id: crypto.randomUUID(),
          leftOperand: c.leftOperand || { type: "indicator", ref: "" },
          operator: c.operator || ">",
          rightOperand: c.rightOperand || { type: "value", ref: "", value: 0 },
          role: c.role || "required",
          weight: c.weight ?? 10,
          enabled: true,
        })),
      })) || base.conditionGroups,
      scoreWeights: proposal.scoreWeights || base.scoreWeights,
      riskRules: proposal.riskRules
        ? { ...base.riskRules, ...proposal.riskRules }
        : base.riskRules,
      alertRules: base.alertRules,
      symbols: proposal.symbols || base.symbols,
      timeframes: proposal.timeframes || base.timeframes,
      tags: proposal.tags || base.tags,
    };

    replaceDraft(merged);
    setPendingProposal(null);
    toast.success("Estratégia aplicada ao builder!");

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "✅ Mudanças aplicadas ao editor. Você pode ajustar qualquer campo manualmente." },
    ]);
  };

  return (
    <div className="h-full flex flex-col bg-card/30 border-l border-border">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Assistente IA</span>
        <Badge variant="outline" className="text-[9px] ml-auto">Lovable AI</Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6 space-y-4">
              <Sparkles className="h-8 w-8 text-primary/40 mx-auto" />
              <div>
                <p className="text-xs text-foreground font-medium">Assistente de Estratégia</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Descreva em linguagem natural o que quer e a IA monta a estratégia para você.
                </p>
              </div>

              {/* Quick actions */}
              <div className="space-y-1">
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.prompt)}
                    className="w-full text-left p-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border border-transparent hover:border-border"
                  >
                    <ArrowRight className="h-2.5 w-2.5 inline mr-1" />
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <div
                className={`rounded-lg p-2.5 text-xs ${
                  msg.role === "user"
                    ? "bg-primary/10 text-foreground ml-6"
                    : "bg-accent/30 text-foreground mr-2"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>

              {/* Strategy proposal diff */}
              {msg.strategyProposal && (
                <div className="mt-2 mr-2 border border-primary/30 rounded-lg p-2.5 bg-primary/5 space-y-2">
                  <div className="text-[10px] font-semibold text-foreground">Mudanças propostas:</div>

                  {msg.strategyProposal.name && (
                    <DiffLine label="Nome" value={msg.strategyProposal.name} />
                  )}
                  {msg.strategyProposal.symbols && (
                    <DiffLine label="Ativos" value={msg.strategyProposal.symbols.join(", ")} />
                  )}
                  {msg.strategyProposal.timeframes && (
                    <DiffLine label="Timeframes" value={msg.strategyProposal.timeframes.join(", ")} />
                  )}
                  {msg.strategyProposal.indicators && (
                    <DiffLine
                      label="Indicadores"
                      value={msg.strategyProposal.indicators
                        .map((ind: any) => `${ind.label || ind.type}`)
                        .join(", ")}
                    />
                  )}
                  {msg.strategyProposal.conditionGroups && (
                    <DiffLine
                      label="Condições"
                      value={`${msg.strategyProposal.conditionGroups.reduce(
                        (acc: number, g: any) => acc + (g.conditions?.length || 0),
                        0
                      )} condições em ${msg.strategyProposal.conditionGroups.length} grupo(s)`}
                    />
                  )}
                  {msg.strategyProposal.direction && (
                    <DiffLine label="Direção" value={msg.strategyProposal.direction} />
                  )}
                  {msg.strategyProposal.scoreMin !== undefined && (
                    <DiffLine label="Score Mín" value={String(msg.strategyProposal.scoreMin)} />
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => applyProposal(msg.strategyProposal!)}
                    >
                      <Check className="h-2.5 w-2.5" /> Aplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => setPendingProposal(null)}
                    >
                      <X className="h-2.5 w-2.5" /> Ignorar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processando...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Descreva o que quer... (Enter para enviar)"
            rows={2}
            className="text-xs resize-none"
          />
          <Button
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 h-auto"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiffLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[10px]">
      <span className="text-muted-foreground shrink-0 w-20">{label}:</span>
      <span className="text-foreground font-mono">{value}</span>
    </div>
  );
}
