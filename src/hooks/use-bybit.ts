import { useQuery } from "@tanstack/react-query";
import { getTickers, getKlines, getOrderbook, getOpenInterest, getFundingHistory } from "@/services/bybit";
import type { BybitCategory } from "@/services/bybit";

export function useTickers(category: BybitCategory = "linear", symbol?: string) {
  return useQuery({
    queryKey: ["bybit-tickers", category, symbol],
    queryFn: () => getTickers(category, symbol),
    refetchInterval: 1000,
    staleTime: 500,
  });
}

export function useKlines(symbol: string, interval: string, category: BybitCategory = "linear", limit = 200) {
  return useQuery({
    queryKey: ["bybit-klines", category, symbol, interval, limit],
    queryFn: () => getKlines(symbol, interval, category, limit),
    staleTime: 10000,
    enabled: !!symbol,
  });
}

export function useOrderbook(symbol: string, category: BybitCategory = "linear") {
  return useQuery({
    queryKey: ["bybit-orderbook", category, symbol],
    queryFn: () => getOrderbook(symbol, category),
    refetchInterval: 3000,
    enabled: !!symbol,
  });
}

export function useOpenInterest(symbol: string, category: BybitCategory = "linear") {
  return useQuery({
    queryKey: ["bybit-oi", category, symbol],
    queryFn: () => getOpenInterest(symbol, "5min", category),
    refetchInterval: 30000,
    enabled: !!symbol && category === "linear",
  });
}

export function useFundingRate(symbol: string, category: BybitCategory = "linear") {
  return useQuery({
    queryKey: ["bybit-funding", category, symbol],
    queryFn: () => getFundingHistory(symbol, category),
    refetchInterval: 60000,
    enabled: !!symbol && category === "linear",
  });
}
