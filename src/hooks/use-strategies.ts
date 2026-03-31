import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type Strategy = Tables<"strategies">;
type StrategyIndicator = Tables<"strategy_indicators">;
type StrategyCondition = Tables<"strategy_conditions">;
type StrategyWeight = Tables<"strategy_weights">;
type StrategySymbol = Tables<"strategy_symbols">;
type StrategyTimeframe = Tables<"strategy_timeframes">;

export interface FullStrategy extends Strategy {
  indicators: StrategyIndicator[];
  conditions: StrategyCondition[];
  weights: StrategyWeight[];
  symbols: StrategySymbol[];
  timeframes: StrategyTimeframe[];
}

// ---------- Fetch all strategies with relations ----------
export function useStrategies() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["strategies", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<FullStrategy[]> => {
      const uid = session!.user.id;

      const [strategies, indicators, conditions, weights, symbols, timeframes] = await Promise.all([
        supabase.from("strategies").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("strategy_indicators").select("*"),
        supabase.from("strategy_conditions").select("*"),
        supabase.from("strategy_weights").select("*"),
        supabase.from("strategy_symbols").select("*"),
        supabase.from("strategy_timeframes").select("*"),
      ]);

      if (strategies.error) throw strategies.error;

      return (strategies.data || []).map((s) => ({
        ...s,
        indicators: (indicators.data || []).filter((i) => i.strategy_id === s.id),
        conditions: (conditions.data || []).filter((c) => c.strategy_id === s.id),
        weights: (weights.data || []).filter((w) => w.strategy_id === s.id),
        symbols: (symbols.data || []).filter((sym) => sym.strategy_id === s.id),
        timeframes: (timeframes.data || []).filter((tf) => tf.strategy_id === s.id),
      }));
    },
  });
}

// ---------- Fetch single strategy ----------
export function useStrategy(id: string | null) {
  return useQuery({
    queryKey: ["strategy", id],
    enabled: !!id,
    queryFn: async (): Promise<FullStrategy> => {
      const [strategy, indicators, conditions, weights, symbols, timeframes] = await Promise.all([
        supabase.from("strategies").select("*").eq("id", id!).single(),
        supabase.from("strategy_indicators").select("*").eq("strategy_id", id!),
        supabase.from("strategy_conditions").select("*").eq("strategy_id", id!),
        supabase.from("strategy_weights").select("*").eq("strategy_id", id!),
        supabase.from("strategy_symbols").select("*").eq("strategy_id", id!),
        supabase.from("strategy_timeframes").select("*").eq("strategy_id", id!),
      ]);

      if (strategy.error) throw strategy.error;

      return {
        ...strategy.data,
        indicators: indicators.data || [],
        conditions: conditions.data || [],
        weights: weights.data || [],
        symbols: symbols.data || [],
        timeframes: timeframes.data || [],
      };
    },
  });
}

// ---------- Create strategy ----------
export function useCreateStrategy() {
  const qc = useQueryClient();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      market: string;
      scoreMin: number;
      minRr: number;
      symbols: string[];
      timeframes: string[];
      alertMode?: string;
    }) => {
      const uid = session!.user.id;

      const { data: strategy, error } = await supabase.from("strategies").insert({
        user_id: uid,
        name: data.name,
        description: data.description || null,
        market: data.market,
        score_min: data.scoreMin,
        min_rr: data.minRr,
        alert_mode: data.alertMode || "candle_close",
      }).select().single();

      if (error) throw error;

      // Insert symbols and timeframes
      const [symResult, tfResult] = await Promise.all([
        data.symbols.length > 0
          ? supabase.from("strategy_symbols").insert(
              data.symbols.map((s) => ({ strategy_id: strategy.id, symbol: s }))
            )
          : Promise.resolve({ error: null }),
        data.timeframes.length > 0
          ? supabase.from("strategy_timeframes").insert(
              data.timeframes.map((tf) => ({ strategy_id: strategy.id, timeframe: tf }))
            )
          : Promise.resolve({ error: null }),
      ]);

      if (symResult.error) throw symResult.error;
      if (tfResult.error) throw tfResult.error;

      return strategy;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast.success("Estratégia criada com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar estratégia: ${err.message}`);
    },
  });
}

// ---------- Update strategy ----------
export function useUpdateStrategy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: TablesUpdate<"strategies"> & { id: string }) => {
      const { error } = await supabase.from("strategies").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast.success("Estratégia atualizada!");
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
  });
}

// ---------- Delete strategy ----------
export function useDeleteStrategy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Cascade deletes related rows via DB foreign keys
      const { error } = await supabase.from("strategies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast.success("Estratégia removida!");
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
  });
}

// ---------- Toggle strategy active ----------
export function useToggleStrategy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("strategies").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
    },
  });
}

// ---------- Manage indicators ----------
export function useAddIndicator() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<"strategy_indicators">) => {
      const { data: result, error } = await supabase.from("strategy_indicators").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      qc.invalidateQueries({ queryKey: ["strategy"] });
    },
  });
}

export function useRemoveIndicator() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("strategy_indicators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      qc.invalidateQueries({ queryKey: ["strategy"] });
    },
  });
}

// ---------- Manage conditions ----------
export function useAddCondition() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (data: TablesInsert<"strategy_conditions">) => {
      const { data: result, error } = await supabase.from("strategy_conditions").insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      qc.invalidateQueries({ queryKey: ["strategy"] });
    },
  });
}

export function useRemoveCondition() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("strategy_conditions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      qc.invalidateQueries({ queryKey: ["strategy"] });
    },
  });
}

// ---------- Manage weights ----------
export function useSaveWeights() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ strategyId, weights }: { strategyId: string; weights: { block_name: string; weight: number }[] }) => {
      // Delete existing and re-insert
      await supabase.from("strategy_weights").delete().eq("strategy_id", strategyId);

      if (weights.length > 0) {
        const { error } = await supabase.from("strategy_weights").insert(
          weights.map((w) => ({ strategy_id: strategyId, ...w }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategies"] });
      qc.invalidateQueries({ queryKey: ["strategy"] });
      toast.success("Pesos atualizados!");
    },
  });
}
