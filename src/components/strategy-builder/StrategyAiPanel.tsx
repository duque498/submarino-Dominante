import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Sparkles, Loader2 } from "lucide-react";
import type { useStrategyDraft } from "@/hooks/use-strategy-draft";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  "Crie uma estratégia de scalp para BTCUSDT em 5m",
  "Adicione RSI 14 e EMA 21",
  "Use candle fechado e score mínimo 65",
  "Sugira melhorias para essa estratégia",
  "Explique essa estratégia em texto simples",
  "Faça uma versão mais conservadora",
];

interface Props {
  draftHook: ReturnType<typeof useStrategyDraft>;
}

export function StrategyAiPanel({ draftHook }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // TODO: Connect to strategy-ai edge function in Phase 3
    // For now, simulate a response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "🚧 O assistente IA será conectado na Fase 3. Por enquanto, use o editor manual para configurar sua estratégia. O assistente poderá:\n\n• Criar estratégias do zero a partir de descrições textuais\n• Editar estratégias existentes por comando\n• Sugerir melhorias e detectar inconsistências\n• Gerar nomes, tags e descrições automaticamente",
        },
      ]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="h-full flex flex-col bg-card/30 border-l border-border">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Assistente IA</span>
        <Badge variant="outline" className="text-[9px] ml-auto">Beta</Badge>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
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
                    onClick={() => sendMessage(action)}
                    className="w-full text-left p-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors border border-transparent hover:border-border"
                  >
                    → {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg p-2.5 text-xs ${
                msg.role === "user"
                  ? "bg-primary/10 text-foreground ml-6"
                  : "bg-accent/30 text-foreground mr-6"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Pensando...
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
            placeholder="Descreva o que quer..."
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
