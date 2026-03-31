import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOP_50_PAIRS = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT",
  "AVAXUSDT","DOTUSDT","LINKUSDT","MATICUSDT","SHIBUSDT","LTCUSDT","BCHUSDT",
  "UNIUSDT","APTUSDT","NEARUSDT","ICPUSDT","FILUSDT","ARBUSDT","OPUSDT",
  "ATOMUSDT","MKRUSDT","GRTUSDT","INJUSDT","IMXUSDT","RNDRUSDT","FTMUSDT",
  "TIAUSDT","SUIUSDT","SEIUSDT","AAVEUSDT","LDOUSDT","SNXUSDT","RUNEUSDT",
  "PENDLEUSDT","WLDUSDT","STXUSDT","ORDIUSDT","BLURUSDT","FETUSDT","AGIXUSDT",
  "WIFUSDT","JUPUSDT","ENAUSDT","PEPEUSDT","FLOKIUSDT","BONKUSDT","TONUSDT","TRXUSDT"
];

async function fetchBybitTickers() {
  const res = await fetch("https://api.bybit.com/v5/market/tickers?category=linear");
  const data = await res.json();
  if (data.retCode !== 0) throw new Error(`Bybit error: ${data.retMsg}`);
  return data.result.list;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const { action, messages, symbol, strategyContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // ─── CHAT action: free conversation with AI ───
    if (action === "chat") {
      // Fetch live market snapshot for context
      const allTickers = await fetchBybitTickers();
      const top50 = allTickers.filter((t: any) => TOP_50_PAIRS.includes(t.symbol));

      const marketSnapshot = top50.slice(0, 20).map((t: any) => ({
        symbol: t.symbol,
        price: t.lastPrice,
        change24h: `${(parseFloat(t.price24hPcnt) * 100).toFixed(2)}%`,
        volume24h: t.volume24h,
        fundingRate: t.fundingRate,
      }));

      const systemPrompt = `Você é um analista de criptomoedas expert. Responda SEMPRE em português brasileiro.

Dados ao vivo do mercado (top 20 pares):
${JSON.stringify(marketSnapshot, null, 2)}

${strategyContext ? `Estratégia ativa do usuário:\n${JSON.stringify(strategyContext, null, 2)}\n` : ""}
${symbol ? `Par em foco: ${symbol}` : ""}

Regras:
- Analise tendências, suportes, resistências, volume e funding rate
- Dê recomendações claras e objetivas
- Se o usuário tiver uma estratégia, relacione a análise com os indicadores dela
- Use dados reais do mercado nas respostas
- Seja direto e prático como um trader profissional`;

      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...(messages || []),
      ];

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: chatMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit. Tente novamente em alguns segundos." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos insuficientes." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error("AI gateway error");
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ─── ANALYZE action: full market analysis ───
    if (action === "analyze") {
      const allTickers = await fetchBybitTickers();
      const top50 = allTickers.filter((t: any) => TOP_50_PAIRS.includes(t.symbol));

      const marketData = top50.map((t: any) => ({
        symbol: t.symbol,
        price: t.lastPrice,
        change24h: `${(parseFloat(t.price24hPcnt) * 100).toFixed(2)}%`,
        volume24h: t.volume24h,
        high24h: t.highPrice24h,
        low24h: t.lowPrice24h,
        fundingRate: t.fundingRate,
        openInterest: t.openInterest,
      }));

      const prompt = `Analise o mercado crypto agora com base nesses dados ao vivo:

${JSON.stringify(marketData, null, 2)}

${strategyContext ? `\nEstratégia do trader:\n${JSON.stringify(strategyContext, null, 2)}` : ""}

Forneça:
1. **Visão Geral** - Sentimento do mercado (bullish/bearish/neutro) e por quê
2. **Top Movers** - As 5 maiores altas e baixas e o que pode estar causando
3. **Tendências** - Padrões observáveis nos dados (volume, funding, OI)
4. **Níveis Chave** para ${symbol || "BTC"} - Suportes e resistências baseados em high/low 24h
5. **Oportunidades** - 3-5 pares promissores para análise mais profunda e por quê
6. **Alerta de Risco** - Pares com funding rate extremo ou divergências
${strategyContext ? "7. **Análise da Estratégia** - Como a estratégia ativa se relaciona com o cenário atual" : ""}

Seja direto e use dados reais. Responda em PT-BR.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Você é um analista de criptomoedas expert e trader profissional. Responda sempre em português brasileiro com análises práticas e objetivas." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI error:", response.status, errText);
        throw new Error("AI analysis failed");
      }

      const data = await response.json();
      const analysisText = data.choices?.[0]?.message?.content || "Análise indisponível";

      // Save to DB if authenticated
      if (userId) {
        await supabase.from("market_analyses").insert({
          user_id: userId,
          symbol: symbol || "MARKET",
          strategy_id: strategyContext?.id || null,
          analysis_text: analysisText,
          sentiment: analysisText.toLowerCase().includes("bullish") ? "bullish" :
                     analysisText.toLowerCase().includes("bearish") ? "bearish" : "neutral",
          market_data_snapshot: { tickers: marketData.slice(0, 10), timestamp: new Date().toISOString() },
        });
      }

      return new Response(JSON.stringify({
        analysis: analysisText,
        marketData: marketData.slice(0, 10),
        timestamp: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCAN action: scan top 50 pairs ───
    if (action === "scan_pairs") {
      const allTickers = await fetchBybitTickers();
      const top50 = allTickers
        .filter((t: any) => TOP_50_PAIRS.includes(t.symbol))
        .map((t: any) => ({
          symbol: t.symbol,
          lastPrice: parseFloat(t.lastPrice),
          change24h: parseFloat(t.price24hPcnt) * 100,
          volume24h: parseFloat(t.volume24h),
          high24h: parseFloat(t.highPrice24h),
          low24h: parseFloat(t.lowPrice24h),
          fundingRate: parseFloat(t.fundingRate || "0"),
          openInterest: parseFloat(t.openInterest || "0"),
          turnover24h: parseFloat(t.turnover24h || "0"),
        }));

      // Sort by volume descending
      top50.sort((a: any, b: any) => b.turnover24h - a.turnover24h);

      // Basic analysis flags
      const scanned = top50.map((t: any) => {
        const isHighVolume = t.turnover24h > 100_000_000;
        const isPositiveFunding = t.fundingRate > 0;
        const isBullish24h = t.change24h > 2;
        const isBearish24h = t.change24h < -2;
        const isExtremeFunding = Math.abs(t.fundingRate) > 0.01;
        const priceRange = ((t.high24h - t.low24h) / t.lastPrice) * 100;
        const isHighVolatility = priceRange > 5;

        return {
          ...t,
          flags: {
            highVolume: isHighVolume,
            bullish24h: isBullish24h,
            bearish24h: isBearish24h,
            extremeFunding: isExtremeFunding,
            highVolatility: isHighVolatility,
            positiveFunding: isPositiveFunding,
          },
          score: (isHighVolume ? 20 : 0) +
                 (isBullish24h ? 15 : isBearish24h ? 15 : 0) +
                 (isHighVolatility ? 10 : 0) +
                 (isExtremeFunding ? 10 : 0),
        };
      });

      return new Response(JSON.stringify({
        pairs: scanned,
        timestamp: new Date().toISOString(),
        total: scanned.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("market-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
