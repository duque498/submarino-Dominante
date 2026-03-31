import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Loader2,
  Brain,
  Target,
  ShieldAlert,
  BarChart3,
  PlayCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCreatePaperTrade } from "@/hooks/use-paper-trades";

export interface EntrySignalData {
  symbol: string;
  direction: "long" | "short";
  strategyName: string;
  score: number;
  totalConditions: number;
  passedConditions: number;
  entryPrice: number;
  stopPrice: number;
  target1Price: number;
  target2Price: number;
  rrRatio: number;
  timeframe: string;
  market: string;
  conditionDetails: { name: string; passed: boolean }[];
  indicatorSnapshot: Record<string, number | null>;
}

interface EntryHubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signal: EntrySignalData | null;
  isTest?: boolean;
}

export function EntryHubModal({ open, onOpenChange, signal, isTest }: EntryHubModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEvaluation, setAiEvaluation] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const createTrade = useCreatePaperTrade();

  // Reset entered state when signal changes
  useEffect(() => { setEntered(false); setAiEvaluation(null); }, [signal]);

  const handleEnterTrade = useCallback(() => {
    if (!signal) return;
    createTrade.mutate({
      symbol: signal.symbol,
      direction: signal.direction === "long" ? "buy" : "sell",
      entry_price: signal.entryPrice,
      stop_price: signal.stopPrice,
      target_price: signal.target1Price,
    }, {
      onSuccess: () => {
        setEntered(true);
        toast.success("Paper trade aberto! Monitorando TP e SL...");
      },
    });
  }, [signal, createTrade]);

  const copyValue = useCallback((label: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
    toast.success(`${label} copiado!`);
  }, []);

  const copyAll = useCallback(() => {
    if (!signal) return;
    const text = [
      `📊 ${signal.symbol} — ${signal.direction.toUpperCase()}`,
      `⏱ Timeframe: ${signal.timeframe}`,
      `🎯 Score: ${signal.score}/100 (${signal.passedConditions}/${signal.totalConditions} condições)`,
      ``,
      `▶️ Entrada: ${signal.entryPrice}`,
      `🛑 Stop Loss: ${signal.stopPrice}`,
      `✅ TP1: ${signal.target1Price}`,
      `✅ TP2: ${signal.target2Price}`,
      `📐 R/R: ${signal.rrRatio.toFixed(2)}`,
      ``,
      `Estratégia: ${signal.strategyName}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
    toast.success("Dados copiados para a área de transferência!");
  }, [signal]);

  const requestAiEvaluation = useCallback(async () => {
    if (!signal) return;
    setAiLoading(true);
    setAiEvaluation(null);
    try {
      const { data, error } = await supabase.functions.invoke("strategy-ai", {
        body: {
          action: "suggest",
          prompt: `Avalie esta oportunidade de trade e dê sua opinião em 3-4 linhas:
Ativo: ${signal.symbol} (${signal.market})
Direção: ${signal.direction.toUpperCase()}
Timeframe: ${signal.timeframe}
Score: ${signal.score}/100 (${signal.passedConditions}/${signal.totalConditions} condições atendidas)
Entrada: ${signal.entryPrice}
Stop: ${signal.stopPrice}
TP1: ${signal.target1Price} | TP2: ${signal.target2Price}
R/R: ${signal.rrRatio.toFixed(2)}
Indicadores: ${JSON.stringify(signal.indicatorSnapshot)}
Condições aprovadas: ${signal.conditionDetails.filter(c => c.passed).map(c => c.name).join(", ")}
Condições reprovadas: ${signal.conditionDetails.filter(c => !c.passed).map(c => c.name).join(", ")}

Responda de forma direta: vale entrar? Qual o risco? Alguma ressalva?`,
          messages: [],
        },
      });
      if (error) throw error;
      setAiEvaluation(data?.content || data?.explanation || "Sem avaliação disponível.");
    } catch (e) {
      console.error("AI eval error:", e);
      setAiEvaluation("Não foi possível obter avaliação da IA no momento.");
    } finally {
      setAiLoading(false);
    }
  }, [signal]);

  if (!signal) return null;

  const isLong = signal.direction === "long";
  const pricePrecision = signal.entryPrice < 1 ? 6 : signal.entryPrice < 100 ? 4 : 2;
  const fmt = (n: number) => n.toFixed(pricePrecision);
  const stopPct = Math.abs((signal.stopPrice - signal.entryPrice) / signal.entryPrice * 100);
  const tp1Pct = Math.abs((signal.target1Price - signal.entryPrice) / signal.entryPrice * 100);
  const tp2Pct = Math.abs((signal.target2Price - signal.entryPrice) / signal.entryPrice * 100);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isTest && (
              <Badge variant="outline" className="text-[10px] border-yellow-500 text-yellow-500">TESTE</Badge>
            )}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-md ${isLong ? "bg-bull/10" : "bg-bear/10"}`}>
              {isLong ? <TrendingUp className="h-5 w-5 text-bull" /> : <TrendingDown className="h-5 w-5 text-bear" />}
              <span className={`font-bold text-lg ${isLong ? "text-bull" : "text-bear"}`}>
                {signal.direction.toUpperCase()}
              </span>
            </div>
            <span className="font-mono text-xl text-foreground">{signal.symbol}</span>
            <Badge variant="outline" className="font-mono text-xs">{signal.timeframe}</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Score + Conditions Summary */}
        <div className="flex items-center gap-4 py-2">
          <ScoreBadge score={signal.score} size="lg" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              {signal.passedConditions}/{signal.totalConditions} condições atendidas
            </div>
            <div className="text-xs text-muted-foreground">{signal.strategyName}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="flex items-center gap-1 text-sm font-mono">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-foreground">R/R {signal.rrRatio.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Trade Levels — copy-friendly */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Níveis de Entrada
          </h4>

          {[
            { label: "Entrada", value: fmt(signal.entryPrice), color: "text-primary", pct: null },
            { label: "Stop Loss", value: fmt(signal.stopPrice), color: "text-bear", pct: `-${stopPct.toFixed(2)}%` },
            { label: "TP1", value: fmt(signal.target1Price), color: "text-bull", pct: `+${tp1Pct.toFixed(2)}%` },
            { label: "TP2", value: fmt(signal.target2Price), color: "text-bull", pct: `+${tp2Pct.toFixed(2)}%` },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 group cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => copyValue(row.label, row.value)}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16">{row.label}</span>
                <span className={`font-mono font-bold text-sm ${row.color}`}>{row.value}</span>
                {row.pct && (
                  <span className="text-[10px] text-muted-foreground">({row.pct})</span>
                )}
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                {copied === row.label ? (
                  <Check className="h-3.5 w-3.5 text-bull" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5 mt-1"
            onClick={copyAll}
          >
            {copied === "all" ? <Check className="h-3.5 w-3.5 text-bull" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "all" ? "Copiado!" : "Copiar Tudo"}
          </Button>
        </div>

        <Separator />

        {/* Conditions breakdown */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            Condições Avaliadas
          </h4>
          <div className="grid grid-cols-2 gap-1">
            {signal.conditionDetails.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                {c.passed ? (
                  <div className="h-2 w-2 rounded-full bg-bull shrink-0" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-bear/50 shrink-0" />
                )}
                <span className={c.passed ? "text-foreground" : "text-muted-foreground"}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* AI Evaluation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Avaliação da IA
            </h4>
            {!aiEvaluation && !aiLoading && (
              <Button variant="outline" size="sm" className="text-[10px] h-6 gap-1" onClick={requestAiEvaluation}>
                <Brain className="h-3 w-3" />
                Avaliar
              </Button>
            )}
          </div>

          {aiLoading && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background p-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Analisando oportunidade...</span>
            </div>
          )}

          {aiEvaluation && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{aiEvaluation}</p>
            </div>
          )}

          {!aiEvaluation && !aiLoading && (
            <p className="text-[10px] text-muted-foreground">
              Clique em "Avaliar" para a IA analisar esta oportunidade de entrada.
            </p>
          )}
        </div>

        <Separator />

        {/* Enter Trade Button */}
        <div className="pt-1">
          {!entered ? (
            <Button
              className="w-full gap-2 font-semibold"
              variant={signal.direction === "long" ? "default" : "destructive"}
              onClick={handleEnterTrade}
              disabled={createTrade.isPending}
            >
              {createTrade.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Entrei nessa! (Paper Trade)
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-md border border-bull/30 bg-bull/10 p-3">
              <Check className="h-4 w-4 text-bull" />
              <span className="text-sm font-semibold text-bull">
                Entrada registrada — monitorando TP/SL
              </span>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Ao clicar, um paper trade será aberto e você será notificado quando TP ou SL for atingido.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
