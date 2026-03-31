import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  StrategyDraft,
  IndicatorDraft,
  ConditionGroup,
  Condition,
  RiskRules,
  AlertRules,
} from "@/types/strategy";
import {
  createEmptyDraft,
  DEFAULT_RISK_RULES,
  DEFAULT_ALERT_RULES,
  DEFAULT_SCORE_WEIGHTS,
} from "@/types/strategy";
import { getDefaultParams, getIndicatorDef } from "@/lib/indicators";

// Convert DB row to draft
export function dbToDraft(
  strategy: any,
  indicators: any[],
  conditions: any[],
  weights: any[],
  symbols: any[],
  timeframes: any[]
): StrategyDraft {
  // Group conditions by group_id
  const groupMap = new Map<string, any[]>();
  conditions.forEach((c) => {
    const gid = c.group_id || "default";
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid)!.push(c);
  });

  const conditionGroups: ConditionGroup[] = Array.from(groupMap.entries()).map(([gid, conds]) => ({
    id: gid,
    logic: conds[0]?.logic_group === "OR" ? "OR" : "AND",
    conditions: conds.map((c): Condition => ({
      id: c.id,
      leftOperand: {
        type: (c.value as any)?.leftType || "indicator",
        ref: (c.value as any)?.leftRef || c.indicator_id || "",
        output: (c.value as any)?.leftOutput,
      },
      operator: c.operator,
      rightOperand: {
        type: (c.compare_to as any)?.type || "value",
        ref: (c.compare_to as any)?.ref || "",
        value: (c.compare_to as any)?.value ?? (c.value as any)?.rightValue,
      },
      role: c.role as any,
      weight: c.weight || 10,
      enabled: true,
    })),
  }));

  if (conditionGroups.length === 0) {
    conditionGroups.push({ id: crypto.randomUUID(), logic: "AND", conditions: [] });
  }

  const scoreWeights: Record<string, number> = { ...DEFAULT_SCORE_WEIGHTS };
  weights.forEach((w) => {
    scoreWeights[w.block_name] = w.weight;
  });

  return {
    id: strategy.id,
    name: strategy.name,
    description: strategy.description || "",
    market: strategy.market || "linear",
    exchange: (strategy.exchange as any) || "bybit",
    direction: (strategy.direction as any) || "both",
    tags: (strategy.tags as string[]) || [],
    symbols: symbols.map((s) => s.symbol),
    timeframes: timeframes.map((t) => t.timeframe),
    alertMode: (strategy.alert_mode as any) || "candle_close",
    scoreMin: strategy.score_min ?? 60,
    minRr: Number(strategy.min_rr) || 1.8,
    cooldownMinutes: strategy.cooldown_minutes ?? 30,
    maxAlertsPerSymbolPerDay: strategy.max_alerts_per_symbol_per_day ?? 5,
    timeWindowStart: strategy.time_window_start || null,
    timeWindowEnd: strategy.time_window_end || null,
    priority: (strategy.priority as any) || "medium",
    active: strategy.active ?? true,
    indicators: indicators.map((ind): IndicatorDraft => ({
      id: ind.id,
      type: ind.indicator_type,
      label: ind.label || getIndicatorDef(ind.indicator_type)?.label || ind.indicator_type,
      params: (ind.params as Record<string, any>) || {},
      source: ind.source || "close",
      timeframe: ind.timeframe || null,
      role: ind.role as any,
      weight: ind.weight || 0,
      enabled: ind.enabled ?? true,
      plotOnChart: ind.plot_on_chart ?? true,
    })),
    conditionGroups,
    scoreWeights,
    riskRules: (strategy.risk_rules as RiskRules) || { ...DEFAULT_RISK_RULES },
    alertRules: (strategy.alert_rules as AlertRules) || { ...DEFAULT_ALERT_RULES },
    version: strategy.version || 1,
  };
}

export function useStrategyDraft(initialId?: string | null) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StrategyDraft>(createEmptyDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from DB
  const loadStrategy = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [strategy, indicators, conditions, weights, symbols, timeframes] = await Promise.all([
        supabase.from("strategies").select("*").eq("id", id).single(),
        supabase.from("strategy_indicators").select("*").eq("strategy_id", id).order("sort_order"),
        supabase.from("strategy_conditions").select("*").eq("strategy_id", id).order("sort_order"),
        supabase.from("strategy_weights").select("*").eq("strategy_id", id),
        supabase.from("strategy_symbols").select("*").eq("strategy_id", id),
        supabase.from("strategy_timeframes").select("*").eq("strategy_id", id),
      ]);

      if (strategy.error) throw strategy.error;

      const d = dbToDraft(
        strategy.data,
        indicators.data || [],
        conditions.data || [],
        weights.data || [],
        symbols.data || [],
        timeframes.data || []
      );
      setDraft(d);
      setDirty(false);
    } catch (e: any) {
      toast.error("Erro ao carregar estratégia: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) loadStrategy(initialId);
  }, [initialId, loadStrategy]);

  // Update draft field
  const updateDraft = useCallback(<K extends keyof StrategyDraft>(key: K, value: StrategyDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  // Full replace (for AI)
  const replaceDraft = useCallback((newDraft: StrategyDraft) => {
    setDraft(newDraft);
    setDirty(true);
  }, []);

  // Reset
  const resetDraft = useCallback(() => {
    setDraft(createEmptyDraft());
    setDirty(false);
  }, []);

  // Save to DB
  const saveDraft = useCallback(async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    const uid = session.user.id;

    try {
      const isNew = !draft.id;
      let strategyId = draft.id;

      // Upsert strategy
      const strategyData: any = {
        user_id: uid,
        name: draft.name,
        description: draft.description || null,
        market: draft.market,
        exchange: draft.exchange,
        direction: draft.direction,
        tags: draft.tags,
        score_min: draft.scoreMin,
        min_rr: draft.minRr,
        alert_mode: draft.alertMode,
        cooldown_minutes: draft.cooldownMinutes,
        max_alerts_per_symbol_per_day: draft.maxAlertsPerSymbolPerDay,
        time_window_start: draft.timeWindowStart,
        time_window_end: draft.timeWindowEnd,
        priority: draft.priority,
        active: draft.active,
        risk_rules: draft.riskRules,
        alert_rules: draft.alertRules,
        version: draft.version + (isNew ? 0 : 1),
      };

      if (isNew) {
        const { data, error } = await supabase
          .from("strategies")
          .insert(strategyData)
          .select()
          .single();
        if (error) throw error;
        strategyId = data.id;
      } else {
        const { error } = await supabase
          .from("strategies")
          .update(strategyData)
          .eq("id", strategyId!);
        if (error) throw error;
      }

      // Delete and re-insert related data
      await Promise.all([
        supabase.from("strategy_indicators").delete().eq("strategy_id", strategyId!),
        supabase.from("strategy_conditions").delete().eq("strategy_id", strategyId!),
        supabase.from("strategy_weights").delete().eq("strategy_id", strategyId!),
        supabase.from("strategy_symbols").delete().eq("strategy_id", strategyId!),
        supabase.from("strategy_timeframes").delete().eq("strategy_id", strategyId!),
      ]);

      // Insert indicators
      if (draft.indicators.length > 0) {
        const { error } = await supabase.from("strategy_indicators").insert(
          draft.indicators.map((ind, i) => ({
            strategy_id: strategyId!,
            indicator_type: ind.type,
            label: ind.label,
            params: ind.params,
            source: ind.source,
            timeframe: ind.timeframe,
            role: ind.role,
            weight: ind.weight,
            enabled: ind.enabled,
            plot_on_chart: ind.plotOnChart,
            sort_order: i,
          }))
        );
        if (error) throw error;
      }

      // Insert conditions
      for (const group of draft.conditionGroups) {
        if (group.conditions.length === 0) continue;
        const { error } = await supabase.from("strategy_conditions").insert(
          group.conditions.map((c, i) => ({
            strategy_id: strategyId!,
            group_id: group.id,
            logic_group: group.logic,
            condition_type: c.leftOperand.type,
            operator: c.operator,
            value: {
              leftType: c.leftOperand.type,
              leftRef: c.leftOperand.ref,
              leftOutput: c.leftOperand.output,
              rightValue: c.rightOperand.value,
            },
            compare_to: {
              type: c.rightOperand.type,
              ref: c.rightOperand.ref,
              value: c.rightOperand.value,
            },
            role: c.role,
            weight: c.weight,
            sort_order: i,
          }))
        );
        if (error) throw error;
      }

      // Insert weights
      const weightEntries = Object.entries(draft.scoreWeights).filter(([, w]) => w > 0);
      if (weightEntries.length > 0) {
        const { error } = await supabase.from("strategy_weights").insert(
          weightEntries.map(([block_name, weight]) => ({
            strategy_id: strategyId!,
            block_name,
            weight,
          }))
        );
        if (error) throw error;
      }

      // Insert symbols & timeframes
      await Promise.all([
        draft.symbols.length > 0
          ? supabase.from("strategy_symbols").insert(
              draft.symbols.map((s) => ({ strategy_id: strategyId!, symbol: s }))
            )
          : Promise.resolve({ error: null }),
        draft.timeframes.length > 0
          ? supabase.from("strategy_timeframes").insert(
              draft.timeframes.map((tf) => ({ strategy_id: strategyId!, timeframe: tf }))
            )
          : Promise.resolve({ error: null }),
      ]);

      // Save version snapshot
      await supabase.from("strategy_versions").insert({
        strategy_id: strategyId!,
        user_id: uid,
        version: draft.version + (isNew ? 0 : 1),
        snapshot: draft as any,
        change_summary: isNew ? "Criação inicial" : "Atualização",
      });

      setDraft((prev) => ({ ...prev, id: strategyId!, version: prev.version + (isNew ? 0 : 1) }));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["strategies"] });
      toast.success(isNew ? "Estratégia criada!" : "Estratégia salva!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  }, [draft, session, qc]);

  // Autosave with debounce (5s)
  useEffect(() => {
    if (!dirty || !draft.id || !draft.name.trim()) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveDraft();
    }, 5000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [dirty, draft, saveDraft]);

  // Indicator helpers
  const addIndicator = useCallback((type: string) => {
    const def = getIndicatorDef(type);
    if (!def) return;
    const newInd: IndicatorDraft = {
      type,
      label: def.label,
      params: getDefaultParams(type),
      source: "close",
      timeframe: null,
      role: "required",
      weight: 10,
      enabled: true,
      plotOnChart: true,
    };
    setDraft((prev) => ({ ...prev, indicators: [...prev.indicators, newInd] }));
    setDirty(true);
  }, []);

  const removeIndicator = useCallback((index: number) => {
    setDraft((prev) => ({
      ...prev,
      indicators: prev.indicators.filter((_, i) => i !== index),
    }));
    setDirty(true);
  }, []);

  const updateIndicator = useCallback((index: number, updates: Partial<IndicatorDraft>) => {
    setDraft((prev) => ({
      ...prev,
      indicators: prev.indicators.map((ind, i) => (i === index ? { ...ind, ...updates } : ind)),
    }));
    setDirty(true);
  }, []);

  // Condition group helpers
  const addConditionGroup = useCallback((logic: "AND" | "OR" = "AND") => {
    setDraft((prev) => ({
      ...prev,
      conditionGroups: [
        ...prev.conditionGroups,
        { id: crypto.randomUUID(), logic, conditions: [] },
      ],
    }));
    setDirty(true);
  }, []);

  const addCondition = useCallback((groupIndex: number, condition: Condition) => {
    setDraft((prev) => ({
      ...prev,
      conditionGroups: prev.conditionGroups.map((g, i) =>
        i === groupIndex ? { ...g, conditions: [...g.conditions, condition] } : g
      ),
    }));
    setDirty(true);
  }, []);

  const removeCondition = useCallback((groupIndex: number, condIndex: number) => {
    setDraft((prev) => ({
      ...prev,
      conditionGroups: prev.conditionGroups.map((g, i) =>
        i === groupIndex
          ? { ...g, conditions: g.conditions.filter((_, ci) => ci !== condIndex) }
          : g
      ),
    }));
    setDirty(true);
  }, []);

  return {
    draft,
    loading,
    saving,
    dirty,
    updateDraft,
    replaceDraft,
    resetDraft,
    saveDraft,
    loadStrategy,
    addIndicator,
    removeIndicator,
    updateIndicator,
    addConditionGroup,
    addCondition,
    removeCondition,
  };
}
