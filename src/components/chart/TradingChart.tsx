import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickData, type HistogramData, type Time } from "lightweight-charts";
import type { CandleData } from "@/services/bybit";
import { getBybitWS, timeframeToInterval } from "@/services/bybit";

interface TradingChartProps {
  candles: CandleData[];
  symbol: string;
  timeframe: string;
  category?: string;
  height?: number;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
}

export function TradingChart({
  candles,
  symbol,
  timeframe,
  category = "linear",
  height = 500,
  entryPrice,
  stopPrice,
  targetPrice,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "hsl(220, 18%, 10%)" },
        textColor: "hsl(215, 15%, 55%)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "hsl(220, 14%, 14%)" },
        horzLines: { color: "hsl(220, 14%, 14%)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "hsl(210, 100%, 52%)", width: 1, style: 2, labelBackgroundColor: "hsl(210, 100%, 52%)" },
        horzLine: { color: "hsl(210, 100%, 52%)", width: 1, style: 2, labelBackgroundColor: "hsl(210, 100%, 52%)" },
      },
      timeScale: {
        borderColor: "hsl(220, 14%, 18%)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "hsl(220, 14%, 18%)",
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "hsl(145, 63%, 42%)",
      downColor: "hsl(0, 72%, 51%)",
      borderUpColor: "hsl(145, 63%, 42%)",
      borderDownColor: "hsl(0, 72%, 51%)",
      wickUpColor: "hsl(145, 63%, 48%)",
      wickDownColor: "hsl(0, 72%, 58%)",
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Resize
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [height]);

  // Update data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles.length) return;

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = candles.map((c) => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? "hsla(145, 63%, 42%, 0.35)" : "hsla(0, 72%, 51%, 0.35)",
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Price lines
    if (candleSeriesRef.current) {
      // Clear existing price lines
      const series = candleSeriesRef.current;
      
      if (entryPrice) {
        series.createPriceLine({
          price: entryPrice,
          color: "hsl(210, 100%, 52%)",
          lineWidth: 1,
          lineStyle: 2,
          title: "Entrada",
        });
      }
      if (stopPrice) {
        series.createPriceLine({
          price: stopPrice,
          color: "hsl(0, 72%, 51%)",
          lineWidth: 1,
          lineStyle: 2,
          title: "Stop",
        });
      }
      if (targetPrice) {
        series.createPriceLine({
          price: targetPrice,
          color: "hsl(145, 63%, 42%)",
          lineWidth: 1,
          lineStyle: 2,
          title: "Alvo",
        });
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, entryPrice, stopPrice, targetPrice]);

  // WebSocket real-time updates
  useEffect(() => {
    if (!symbol || !timeframe) return;

    const ws = getBybitWS(category);
    const bybitInterval = timeframeToInterval[timeframe] || timeframe;
    const topic = ws.subscribeKline(symbol, bybitInterval, (candle) => {
      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({
          time: candle.time as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        });
      }
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.update({
          time: candle.time as Time,
          value: candle.volume,
          color: candle.close >= candle.open ? "hsla(145, 63%, 42%, 0.35)" : "hsla(0, 72%, 51%, 0.35)",
        });
      }
    });

    return () => {
      ws.unsubscribe(topic);
    };
  }, [symbol, timeframe, category]);

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden">
      <div ref={containerRef} />
    </div>
  );
}
