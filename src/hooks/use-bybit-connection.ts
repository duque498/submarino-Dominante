import { useState, useEffect, useCallback } from "react";
import { getBybitWS } from "@/services/bybit";
import type { ConnectionStatus } from "@/services/bybit";

export function useBybitConnection(category: string = "linear") {
  const [status, setStatus] = useState<ConnectionStatus>({
    connected: false,
    lastSync: null,
    latency: null,
    error: null,
  });

  useEffect(() => {
    const ws = getBybitWS(category);
    const unsub = ws.onStatusChange(setStatus);
    return unsub;
  }, [category]);

  return status;
}
