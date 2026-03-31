import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, RefreshCw, Send, TrendingUp, TrendingDown, Minus,
  Loader2, BarChart3, MessageSquare, ScanSearch, ChevronUp, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

type PairScanResult = {
  symbol: string;
  lastPrice: number;
  change24h: number;
  volume24h: number;
  turnover24h: number;
  fundingRate: number;
  score: number;
  flags: Record<string, boolean>;
};

interface MarketAIPanelProps {
  symbol: string;
  strategyContext?: any;
  category: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-analysis`;

export function MarketAIPanel({ symbol, strategyContext, category }: MarketAIPanelProps) {
  const [tab, setTab] = useState("analysis");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisTimestamp, setAnalysisTimestamp] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [pairScans, setPairScans] = useState<PairScanResult[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanTimestamp, setScanTimestamp] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"change24h" | "score" | "turnover24h">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expanded, setExpanded] = useState(true);

  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-refresh analysis every 15 min
  useEffect(() => {
    fetchAnalysis();
    fetchPairScans();
    autoRefreshRef.current = setInterval(() => {
      fetchAnalysis();
      fetchPairScans();
    }, 15 * 60 * 1000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [symbol, strategyContext?.id]);

  const fetchAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-analysis", {
        body: { action: "analyze", symbol, strategyContext },
      });
      if (error) throw error;
      setAnalysis(data.analysis);
      setAnalysisTimestamp(data.timestamp);
    } catch (e) {
      console.error("Analysis error:", e);
    } finally {
      setAnalysisLoading(false);
    }
  }, [symbol, strategyContext]);

  const fetchPairScans = useCallback(async () => {
    setScanLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("market-analysis", {
        body: { action: "scan_pairs" },
      });
      if (error) throw error;
      setPairScans(data.pairs || []);
      setScanTimestamp(data.timestamp);
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setScanLoading(false);
    }
  }, []);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);

    let assistantText = "";
    const updateAssistant = (chunk: string) => {
      assistantText += chunk;
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          action: "chat",
          messages: [...chatMessages, userMsg],
          symbol,
          strategyContext,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Stream failed");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) updateAssistant(content);
          } catch { /* partial */ }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
      updateAssistant("\n\n⚠️ Erro ao conectar com a IA. Tente novamente.");
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sortedPairs = [...pairScans].sort((a, b) => {
    const m = sortDir === "desc" ? -1 : 1;
    return (a[sortField] - b[sortField]) * m;
  });

  const sentimentIcon = analysis?.toLowerCase().includes("bullish")
    ? <TrendingUp className="h-3.5 w-3.5 text-bull" />
    : analysis?.toLowerCase().includes("bearish")
    ? <TrendingDown className="h-3.5 w-3.5 text-bear" />
    : <Minus className="h-3.5 w-3.5 text-muted-foreground" />;

  if (!expanded) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-card/80 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Análise IA</span>
            {sentimentIcon}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border cursor-pointer hover:bg-muted/30"
        onClick={() => setExpanded(false)}
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Análise IA do Mercado</span>
          {sentimentIcon}
        </div>
        <div className="flex items-center gap-2">
          {analysisTimestamp && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {new Date(analysisTimestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full rounded-none border-b border-border bg-transparent h-8">
          <TabsTrigger value="analysis" className="text-[11px] gap-1 flex-1 data-[state=active]:bg-muted/50">
            <BarChart3 className="h-3 w-3" /> Análise
          </TabsTrigger>
          <TabsTrigger value="scanner" className="text-[11px] gap-1 flex-1 data-[state=active]:bg-muted/50">
            <ScanSearch className="h-3 w-3" /> Scanner
            {pairScans.length > 0 && <Badge variant="secondary" className="text-[9px] px-1 h-4">{pairScans.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-[11px] gap-1 flex-1 data-[state=active]:bg-muted/50">
            <MessageSquare className="h-3 w-3" /> Chat
          </TabsTrigger>
        </TabsList>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="m-0">
          <div className="px-3 py-2 flex justify-end">
            <Button size="sm" variant="ghost" className="text-[10px] h-6 gap-1" onClick={fetchAnalysis} disabled={analysisLoading}>
              <RefreshCw className={`h-3 w-3 ${analysisLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          <ScrollArea className="h-[350px] px-3 pb-3">
            {analysisLoading && !analysis ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="ml-2 text-xs text-muted-foreground">Analisando mercado...</span>
              </div>
            ) : analysis ? (
              <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_p]:text-xs [&_li]:text-xs [&_strong]:text-primary">
                <ReactMarkdown>{analysis}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">
                Clique em "Atualizar" para gerar uma análise
              </p>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Scanner Tab */}
        <TabsContent value="scanner" className="m-0">
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {(["score", "change24h", "turnover24h"] as const).map(f => (
                <Button
                  key={f}
                  size="sm"
                  variant={sortField === f ? "secondary" : "ghost"}
                  className="text-[9px] h-5 px-1.5"
                  onClick={() => {
                    if (sortField === f) setSortDir(d => d === "desc" ? "asc" : "desc");
                    else { setSortField(f); setSortDir("desc"); }
                  }}
                >
                  {f === "score" ? "Score" : f === "change24h" ? "Δ24h" : "Volume"}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="text-[10px] h-6 gap-1" onClick={fetchPairScans} disabled={scanLoading}>
              <RefreshCw className={`h-3 w-3 ${scanLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <ScrollArea className="h-[350px]">
            <div className="px-3 pb-3 space-y-1">
              {scanLoading && pairScans.length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                sortedPairs.map(p => (
                  <div
                    key={p.symbol}
                    className={`flex items-center justify-between p-2 rounded text-xs font-mono hover:bg-muted/30 cursor-pointer transition-colors ${
                      p.symbol === symbol ? "bg-primary/10 border border-primary/20" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-foreground w-20 truncate">{p.symbol.replace("USDT", "")}</span>
                      <span className="text-muted-foreground">${p.lastPrice.toLocaleString(undefined, { maximumFractionDigits: p.lastPrice < 1 ? 6 : 2 })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={p.change24h >= 0 ? "text-bull" : "text-bear"}>
                        {p.change24h >= 0 ? "+" : ""}{p.change24h.toFixed(1)}%
                      </span>
                      {p.score > 30 && (
                        <Badge variant="outline" className="text-[8px] px-1 h-4">
                          {p.score}
                        </Badge>
                      )}
                      {p.flags.extremeFunding && (
                        <Badge variant="destructive" className="text-[8px] px-1 h-4">FR!</Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          {scanTimestamp && (
            <div className="px-3 py-1.5 border-t border-border">
              <span className="text-[9px] text-muted-foreground font-mono">
                Atualizado: {new Date(scanTimestamp).toLocaleTimeString("pt-BR")}
              </span>
            </div>
          )}
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="m-0">
          <ScrollArea className="h-[320px] px-3 py-2">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Brain className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground mt-2">
                  Converse com a IA sobre o mercado
                </p>
                <div className="flex flex-wrap gap-1 justify-center mt-3">
                  {[
                    "Qual o sentimento do BTC agora?",
                    "Quais altcoins estão fortes?",
                    "Analise minha estratégia",
                  ].map(q => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6"
                      onClick={() => { setChatInput(q); }}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`mb-3 ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-xs ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none text-xs [&_p]:text-xs [&_li]:text-xs [&_strong]:text-primary">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </ScrollArea>
          <div className="flex gap-1.5 p-2 border-t border-border">
            <Textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder="Pergunte sobre o mercado..."
              className="min-h-[36px] max-h-[80px] text-xs resize-none"
              rows={1}
            />
            <Button size="sm" onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="h-9 w-9 p-0">
              {chatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
