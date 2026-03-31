import { useEffect, useRef, memo } from "react";

// Map our indicator types to TradingView study IDs
const INDICATOR_TO_TV_STUDY: Record<string, string> = {
  ema: "MAExp@tv-basicstudies",
  sma: "MASimple@tv-basicstudies",
  rsi: "RSI@tv-basicstudies",
  macd: "MACD@tv-basicstudies",
  bbands: "BB@tv-basicstudies",
  vwap: "VWAP@tv-basicstudies",
  atr: "ATR@tv-basicstudies",
  stochastic: "Stochastic@tv-basicstudies",
  stoch_rsi: "StochasticRSI@tv-basicstudies",
  adx: "ADX@tv-basicstudies",
  obv: "OBV@tv-basicstudies",
  volume_sma: "Volume@tv-basicstudies",
  supertrend: "Supertrend@tv-basicstudies",
};

// Map indicator params to TradingView study overrides
function getStudyInputs(type: string, params: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "ema":
    case "sma":
      return { length: params.period || 21 };
    case "rsi":
      return { length: params.period || 14 };
    case "macd":
      return {
        "fast_length": params.fast || 12,
        "slow_length": params.slow || 26,
        "signal_length": params.signal || 9,
      };
    case "bbands":
      return { length: params.period || 20, mult: params.stddev || 2 };
    case "atr":
      return { length: params.period || 14 };
    case "stochastic":
      return { "%K": params.k_period || 14, "%D": params.d_period || 3 };
    case "stoch_rsi":
      return { "RSI Length": params.rsi_period || 14, "Stochastic Length": params.stoch_period || 14 };
    case "adx":
      return { "ADX Smoothing": params.period || 14, "DI Length": params.period || 14 };
    default:
      return {};
  }
}

interface StrategyIndicator {
  indicator_type: string;
  params: Record<string, unknown> | null;
  enabled: boolean;
  plot_on_chart: boolean;
}

interface TradingViewChartProps {
  symbol: string;
  timeframe: string;
  category?: string;
  height?: number;
  indicators?: StrategyIndicator[];
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
}

// Map our timeframes to TradingView intervals
function toTVInterval(tf: string): string {
  const map: Record<string, string> = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "12h": "720",
    "1d": "D",
    "1w": "W",
    "1M": "M",
  };
  return map[tf] || "5";
}

function TradingViewChartInner({
  symbol,
  timeframe,
  category = "linear",
  height = 520,
  indicators = [],
  entryPrice,
  stopPrice,
  targetPrice,
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  const tvSymbol = category === "spot"
    ? `BYBIT:${symbol}`
    : `BYBIT:${symbol}.P`;

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    if (containerRef.current.firstChild) {
      containerRef.current.innerHTML = "";
    }

    // Build studies array from strategy indicators
    const studies: { id: string; inputs?: Record<string, unknown> }[] = [];

    for (const ind of indicators) {
      if (!ind.enabled) continue;
      const tvId = INDICATOR_TO_TV_STUDY[ind.indicator_type];
      if (!tvId) continue;
      const inputs = getStudyInputs(ind.indicator_type, (ind.params as Record<string, unknown>) || {});
      studies.push({ id: tvId, inputs });
    }

    const containerId = `tv_chart_${Date.now()}`;
    const div = document.createElement("div");
    div.id = containerId;
    div.style.height = `${height}px`;
    containerRef.current.appendChild(div);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (!(window as any).TradingView) return;

      const widgetConfig: Record<string, unknown> = {
        container_id: containerId,
        autosize: false,
        width: "100%",
        height,
        symbol: tvSymbol,
        interval: toTVInterval(timeframe),
        timezone: "America/Sao_Paulo",
        theme: "dark",
        style: "1",
        locale: "br",
        toolbar_bg: "#171b22",
        enable_publishing: false,
        allow_symbol_change: true,
        save_image: false,
        hide_side_toolbar: false,
        hide_top_toolbar: false,
        withdateranges: true,
        details: true,
        hotlist: false,
        calendar: false,
        studies: studies.map((s) => ({
          id: s.id,
          inputs: s.inputs || {},
        })),
        overrides: {
          "paneProperties.background": "#171b22",
          "paneProperties.backgroundType": "solid",
          "scalesProperties.backgroundColor": "#171b22",
          "scalesProperties.lineColor": "#252a36",
          "scalesProperties.textColor": "#7a8194",
          "mainSeriesProperties.candleStyle.upColor": "#22c55e",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#2dd66f",
          "mainSeriesProperties.candleStyle.wickDownColor": "#f87171",
        },
      };

      widgetRef.current = new (window as any).TradingView.widget(widgetConfig);
    };

    document.head.appendChild(script);

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove?.();
        } catch {}
        widgetRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [tvSymbol, timeframe, height, JSON.stringify(indicators.map((i) => ({ t: i.indicator_type, p: i.params, e: i.enabled })))]);

  return (
    <div className="relative rounded-lg border border-border overflow-hidden" style={{ backgroundColor: "#171b22" }}>
      <div ref={containerRef} />
      {/* Overlay price lines for entry/TP/SL */}
      {(entryPrice || stopPrice || targetPrice) && (
        <div className="absolute top-2 right-2 z-10 space-y-1 text-[10px] font-mono">
          {entryPrice && (
            <div className="rounded bg-primary/20 px-2 py-0.5 text-primary">
              Entrada: ${entryPrice.toLocaleString()}
            </div>
          )}
          {targetPrice && (
            <div className="rounded bg-bull/20 px-2 py-0.5 text-bull">
              TP: ${targetPrice.toLocaleString()}
            </div>
          )}
          {stopPrice && (
            <div className="rounded bg-bear/20 px-2 py-0.5 text-bear">
              SL: ${stopPrice.toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const TradingViewChart = memo(TradingViewChartInner);
