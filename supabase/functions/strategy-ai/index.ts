import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INDICATOR_TYPES = [
  "ema", "sma", "adx", "supertrend", "price_vs_ma",
  "rsi", "macd", "stoch_rsi", "stochastic", "pct_change",
  "volume_sma", "vwap", "obv",
  "bbands", "atr", "volatility_pct", "spread",
  "support_resistance", "price_breakout",
  "open_interest", "funding_rate",
];

const SYSTEM_PROMPT = `Você é um assistente especialista em trading de criptomoedas. Você ajuda usuários a criar e editar estratégias de análise técnica para a exchange Bybit.

Você DEVE usar a tool "build_strategy" para retornar estratégias estruturadas. NUNCA retorne JSON em texto — use sempre a tool.

Regras:
- Responda SEMPRE em português brasileiro
- Preencha todos os campos obrigatórios
- Use valores default sensatos quando o usuário não especificar
- Indicadores disponíveis: ${INDICATOR_TYPES.join(", ")}
- Operadores de condição: >, <, >=, <=, ==, crosses_above, crosses_below, between, increasing, decreasing
- Direções: long, short, both
- Mercados: linear (perpétuo), spot
- Roles: required (obrigatório), score (pontua), informative (apenas visual)
- Timeframes: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W
- Score mínimo padrão: 60
- R/R mínimo padrão: 1.8
- Stop padrão: ATR 1.5x
- Alvos padrão: TP1 em 1.5R e TP2 em 2.5R

Quando o usuário pedir para EDITAR uma estratégia existente, faça merge com os dados atuais — não recrie do zero.
Quando o usuário pedir para EXPLICAR, responda em texto corrido sem usar a tool.
Quando o usuário pedir para SUGERIR MELHORIAS, analise a estratégia e responda com sugestões em texto e, se solicitado, use a tool para aplicar as mudanças.`;

const STRATEGY_TOOL = {
  type: "function",
  function: {
    name: "build_strategy",
    description: "Gera ou edita uma estratégia de trading estruturada com todos os campos editáveis",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da estratégia" },
        description: { type: "string", description: "Descrição detalhada" },
        market: { type: "string", enum: ["linear", "spot"] },
        direction: { type: "string", enum: ["long", "short", "both"] },
        tags: { type: "array", items: { type: "string" } },
        symbols: { type: "array", items: { type: "string" }, description: "Ex: BTCUSDT, ETHUSDT" },
        timeframes: { type: "array", items: { type: "string" }, description: "Ex: 5, 15, 60" },
        alertMode: { type: "string", enum: ["candle_close", "intrabar"] },
        scoreMin: { type: "number", minimum: 0, maximum: 100 },
        minRr: { type: "number", minimum: 0 },
        cooldownMinutes: { type: "number" },
        priority: { type: "string", enum: ["low", "medium", "high"] },
        indicators: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: INDICATOR_TYPES },
              label: { type: "string" },
              params: { type: "object", additionalProperties: true },
              source: { type: "string" },
              role: { type: "string", enum: ["required", "score", "informative"] },
              weight: { type: "number" },
              enabled: { type: "boolean" },
              plotOnChart: { type: "boolean" },
            },
            required: ["type", "label", "params", "role"],
          },
        },
        conditionGroups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              logic: { type: "string", enum: ["AND", "OR"] },
              conditions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    leftOperand: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["indicator", "price", "value"] },
                        ref: { type: "string" },
                        output: { type: "string" },
                      },
                      required: ["type", "ref"],
                    },
                    operator: { type: "string" },
                    rightOperand: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["indicator", "value", "multiplier"] },
                        ref: { type: "string" },
                        value: { type: "number" },
                      },
                      required: ["type"],
                    },
                    role: { type: "string", enum: ["required", "score", "informative"] },
                    weight: { type: "number" },
                  },
                  required: ["leftOperand", "operator", "rightOperand", "role"],
                },
              },
            },
            required: ["logic", "conditions"],
          },
        },
        scoreWeights: {
          type: "object",
          properties: {
            backtest: { type: "number" },
            confluence: { type: "number" },
            volume: { type: "number" },
            spread: { type: "number" },
            trend: { type: "number" },
            risk_reward: { type: "number" },
            derivatives: { type: "number" },
          },
        },
        riskRules: {
          type: "object",
          properties: {
            stopType: { type: "string", enum: ["fixed", "atr", "swing_low", "percentage"] },
            stopValue: { type: "number" },
            targets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  label: { type: "string" },
                  rrMultiple: { type: "number" },
                },
                required: ["label", "rrMultiple"],
              },
            },
            trailingEnabled: { type: "boolean" },
            maxSpreadPercent: { type: "number" },
          },
        },
        explanation: { type: "string", description: "Explicação em linguagem natural do que foi feito" },
      },
      required: ["name", "indicators", "conditionGroups", "explanation"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, prompt, currentStrategy, messages: chatHistory } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build messages
    const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];

    // Include current strategy context if editing
    if (currentStrategy && (action === "edit" || action === "suggest")) {
      messages.push({
        role: "system",
        content: `Estratégia atual do usuário:\n\`\`\`json\n${JSON.stringify(currentStrategy, null, 2)}\n\`\`\`\n\nQuando editar, mantenha os campos existentes e altere apenas o que o usuário pediu.`,
      });
    }

    // Include chat history
    if (chatHistory && Array.isArray(chatHistory)) {
      messages.push(...chatHistory);
    }

    // Add user prompt
    messages.push({ role: "user", content: prompt });

    const body: any = {
      model: "google/gemini-3-flash-preview",
      messages,
      tools: [STRATEGY_TOOL],
    };

    // Force tool use for create/edit actions
    if (action === "create" || action === "edit") {
      body.tool_choice = { type: "function", function: { name: "build_strategy" } };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Erro ao processar com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    let result: any = { type: "text", content: "" };

    // Check for tool call (structured strategy output)
    if (choice?.message?.tool_calls?.length > 0) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function.name === "build_strategy") {
        const strategyData = JSON.parse(toolCall.function.arguments);
        const explanation = strategyData.explanation || "";
        delete strategyData.explanation;

        result = {
          type: "strategy",
          strategy: strategyData,
          explanation,
        };
      }
    } else if (choice?.message?.content) {
      result = {
        type: "text",
        content: choice.message.content,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("strategy-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
