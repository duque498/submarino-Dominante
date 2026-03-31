import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { toast } from "sonner";

export interface PaperTradeRow {
  id: string;
  symbol: string;
  direction: string;
  entry_price: number;
  stop_price: number | null;
  target_price: number | null;
  exit_price: number | null;
  status: string;
  pnl_percent: number | null;
  signal_id: string | null;
  created_at: string;
  closed_at: string | null;
  user_id: string;
}

export function usePaperTrades(status?: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["paper-trades", session?.user?.id, status],
    queryFn: async () => {
      let q = supabase
        .from("paper_trades")
        .select("*")
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data as PaperTradeRow[];
    },
    enabled: !!session?.user?.id,
    refetchInterval: 10000,
  });
}

export function useCreatePaperTrade() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trade: {
      symbol: string;
      direction: string;
      entry_price: number;
      stop_price?: number;
      target_price?: number;
      signal_id?: string;
    }) => {
      if (!session?.user?.id) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("paper_trades")
        .insert({
          ...trade,
          user_id: session.user.id,
          status: "open",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-trades"] });
      toast.success("Paper trade criado!");
    },
  });
}

export function useClosePaperTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      exit_price,
      pnl_percent,
    }: {
      id: string;
      exit_price: number;
      pnl_percent: number;
    }) => {
      const { error } = await supabase
        .from("paper_trades")
        .update({
          status: "closed",
          exit_price,
          pnl_percent,
          closed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-trades"] });
    },
  });
}
