

# Strategy Builder Pro — Plano de Implementação

## Auditoria do Builder Atual

### O que existe
- **StrategyForm**: Dialog simples para criar estratégia (nome, mercado, score min, RR, símbolos, timeframes). Sem edição.
- **StrategyDetail**: Dialog com 3 tabs (Indicadores, Condições, Pesos). Somente visualização + add/remove básico.
- **IndicatorConfig**: Lista indicadores, adiciona por tipo com params, role e peso. Sem edição inline, sem drag-and-drop.
- **ConditionBuilder**: Lista condições flat com operador e valor. Sem grupos AND/OR aninhados, sem comparação entre indicadores.
- **WeightManager**: 7 sliders para blocos de score. Funcional mas isolado.
- **Hooks (use-strategies)**: CRUD básico — create, update, delete, toggle, add/remove indicator/condition, save weights.
- **DB Schema**: `strategies` (nome, mercado, score_min, min_rr, alert_mode, cooldown, time_window), `strategy_indicators`, `strategy_conditions`, `strategy_weights`, `strategy_symbols`, `strategy_timeframes`.

### Limitações Críticas
1. Sem edição inline de campos da estratégia (só criação)
2. Sem direção (long/short/ambos), tags, prioridade, exchange
3. Condições flat — sem grupos aninhados, sem comparação entre indicadores
4. Sem regras de risco (stop, alvo, trailing, slippage)
5. Sem regras de alerta por estratégia
6. Sem preview JSON, resumo textual, validação em tempo real
7. Sem autosave, versionamento, duplicação
8. Sem assistente IA
9. Layout em dialogs — não é um builder dedicado
10. 10 indicadores no catálogo (faltam ADX, OBV, Supertrend, spread, OI, funding, etc.)

---

## Nova Arquitetura

### Rota Dedicada
Substituir o modelo de dialogs por uma página full-screen `/estrategias` com layout de 3 painéis.

```text
┌──────────────┬──────────────────────────────┬───────────────────┐
│  SIDEBAR     │  EDITOR CENTRAL              │  PAINEL IA        │
│  Lista       │  Tabs: Geral | Mercado |     │  Chat contextual  │
│  Busca       │  Indicadores | Condições |   │  Sugestões        │
│  Filtros     │  Score | Risco | Alertas |   │  Diff/Apply       │
│  + Nova      │  Preview                     │  Ações rápidas    │
│  Duplicar    │                              │                   │
└──────────────┴──────────────────────────────┴───────────────────┘
```

### Modelo de Dados (TypeScript)
Tipo local `StrategyDraft` que serve como modelo de edição no frontend, mapeado de/para as tabelas existentes do Supabase:

```typescript
interface StrategyDraft {
  id?: string;
  name: string;
  description: string;
  market: "linear" | "spot";
  exchange: "bybit";
  direction: "long" | "short" | "both";
  tags: string[];
  symbols: string[];
  timeframes: string[];
  alertMode: "candle_close" | "intrabar";
  scoreMin: number;
  minRr: number;
  cooldownMinutes: number;
  maxAlertsPerSymbolPerDay: number;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  priority: "low" | "medium" | "high";
  active: boolean;
  indicators: IndicatorDraft[];
  conditionGroups: ConditionGroup[];
  scoreWeights: Record<string, number>;
  riskRules: RiskRules;
  alertRules: AlertRules;
  version: number;
}

interface IndicatorDraft {
  id?: string;
  type: string;
  label: string;
  params: Record<string, any>;
  source: string;
  timeframe: string | null;
  role: "required" | "score" | "informative";
  weight: number;
  enabled: boolean;
  plotOnChart: boolean;
}

interface ConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: Condition[];
}

interface Condition {
  id: string;
  leftOperand: { type: "indicator" | "price" | "value"; ref: string; output?: string };
  operator: string;
  rightOperand: { type: "indicator" | "value" | "multiplier"; ref: string; value?: number };
  role: "required" | "score" | "informative";
  weight: number;
  enabled: boolean;
}

interface RiskRules {
  stopType: "fixed" | "atr" | "swing_low" | "percentage";
  stopValue: number;
  targets: { label: string; rrMultiple: number }[];
  trailingEnabled: boolean;
  trailingType: string;
  maxSpreadPercent: number;
  minLiquidity: number;
  slippageExpected: number;
}

interface AlertRules {
  scoreMinForAlert: number;
  channels: string[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  cooldownMinutes: number;
  deduplication: boolean;
  customMessage: string | null;
  priority: "low" | "medium" | "high";
}
```

### Migração DB
Adicionar colunas à tabela `strategies`:
- `direction` (text, default 'both')
- `tags` (jsonb, default '[]')
- `priority` (text, default 'medium')
- `risk_rules` (jsonb, default '{}')
- `alert_rules` (jsonb, default '{}')
- `version` (integer, default 1)

Adicionar tabela `strategy_versions` para histórico de snapshots.

Expandir `strategy_conditions` para suportar `group_id` e condições aninhadas.

### Catálogo de Indicadores
Expandir de 10 para 20+ indicadores: adicionar ADX, OBV, Supertrend, Stochastic (separar do StochRSI), spread, volatility_pct, open_interest, funding_rate, price_breakout, price_vs_ma, pct_change.

---

## Edge Function: Assistente IA

`supabase/functions/strategy-ai/index.ts`

Usa Lovable AI (`google/gemini-3-flash-preview`) com tool-calling para gerar/editar estratégias como objetos estruturados.

**Fluxo:**
1. Frontend envia `{ action: "create" | "edit" | "explain" | "suggest", prompt, currentStrategy? }`
2. Edge function monta system prompt com schema da estratégia e catálogo de indicadores
3. Usa tool-calling para forçar output estruturado (`StrategyDraft`)
4. Retorna o draft + explicação textual
5. Frontend mostra diff antes de aplicar

---

## Fases de Implementação

### Fase 1 — Fundação (esta iteração)
1. **Migração DB**: novas colunas + `strategy_versions`
2. **Types**: `StrategyDraft`, `ConditionGroup`, `RiskRules`, `AlertRules` em `src/types/strategy.ts`
3. **Catálogo expandido**: 20+ indicadores em `src/lib/indicators.ts`
4. **Hook `useStrategyDraft`**: state management local com autosave debounced
5. **Nova página**: Layout 3 painéis em `/estrategias` (sidebar + editor + IA panel)
6. **Editor General tab**: todos os campos da visão geral editáveis inline

### Fase 2 — Editor Manual Avançado
1. **Tab Mercado**: exchange, direção, símbolos, timeframes
2. **Tab Indicadores**: editor inline, drag-and-drop (reorder), edição de params, role, peso, plot
3. **Tab Condições**: grupos AND/OR aninhados, comparação entre indicadores, comparação valor fixo, entre timeframes
4. **Tab Score**: sliders de peso + condições que bonificam/penalizam + preview do score
5. **Tab Risco**: stop, alvos, trailing, spread, liquidez, slippage
6. **Tab Alertas**: score por canal, quiet hours, cooldown, mensagem custom
7. **Tab Preview**: resumo textual auto-gerado + JSON colapsável + checklist de validação

### Fase 3 — Assistente IA
1. **Edge function** `strategy-ai` com Lovable AI + tool-calling
2. **Painel IA** no builder: chat, sugestões rápidas, histórico da conversa
3. **Diff modal**: mostra antes/depois antes de aplicar
4. **Ações**: criar do zero, editar existente, explicar, sugerir melhorias, duplicar com variação
5. **Sincronização bidirecional**: IA preenche form, form gera resumo textual

### Fase 4 — Polish
1. **Presets**: templates conservador/moderado/agressivo
2. **Duplicação** de estratégia
3. **Versionamento**: snapshot ao salvar, restaurar versão anterior
4. **Autosave** com debounce
5. **Validação em tempo real**: erros, conflitos, avisos de parâmetros
6. **Empty states**, skeleton loading, estados de erro
7. **Responsividade**: collapse painéis em mobile

---

## Componentes Principais

| Componente | Responsabilidade |
|---|---|
| `StrategyBuilderPage` | Página full-screen, gerencia painéis |
| `StrategyListSidebar` | Lista, busca, filtros, criar/duplicar/excluir |
| `StrategyEditorTabs` | Container das tabs do editor central |
| `StrategyGeneralForm` | Nome, descrição, tags, status, prioridade |
| `StrategyMarketForm` | Exchange, mercado, direção, símbolos, timeframes |
| `StrategyIndicatorsEditor` | Lista editável + drag-and-drop + add indicator |
| `StrategyConditionGroupEditor` | Grupos AND/OR aninhados com conditions |
| `StrategyScoreEditor` | Pesos + condições de score + preview |
| `StrategyRiskEditor` | Stop, alvos, trailing, spread, liquidez |
| `StrategyAlertsEditor` | Canais, score, cooldown, quiet hours |
| `StrategyPreviewPanel` | Resumo textual + JSON + checklist validação |
| `StrategyAiPanel` | Chat IA, sugestões, diff, apply |
| `StrategyDiffModal` | Comparação visual antes/depois |
| `useStrategyDraft` | Hook de state do draft com autosave |

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Complexidade do formulário | Tabs isoladas, validação por seção |
| IA gerando dados inválidos | Tool-calling com schema estrito + validação no frontend |
| Performance com muitos indicadores | Virtualização da lista se > 20 items |
| Migração DB quebrando dados existentes | Colunas novas com defaults, sem alterar existentes |

