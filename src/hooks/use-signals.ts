import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export interface SignalRow {
  id: string;
  symbol: string;
  direction: string;
  score: number;
  timeframe: string;
  market: string;
  strategy_id: string | null;
  entry_price: number | null;
  stop_price: number | null;
  target1_price: number | null;
  target2_price: number | null;
  rr_ratio: number | null;
  justification: string | null;
  score_breakdown: Record<string, number> | null;
  indicator_snapshot: Record<string, unknown> | null;
  created_at: string;
  result: string | null;
  result_pnl: number | null;
}

export function useSignals(limit = 50) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["signals", session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as SignalRow[];
    },
    enabled: !!session?.user?.id,
    refetchInterval: 15000,
  });
}

export function useUnreadAlerts() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["unread-alerts", session?.user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!session?.user?.id,
    refetchInterval: 10000,
  });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unread-alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
