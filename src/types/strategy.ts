// Strategy Builder Pro — Types

export interface IndicatorDraft {
  id?: string;
  type: string;
  label: string;
  params: Record<string, number | string>;
  source: string;
  timeframe: string | null;
  role: "required" | "score" | "informative";
  weight: number;
  enabled: boolean;
  plotOnChart: boolean;
}

export interface ConditionOperand {
  type: "indicator" | "price" | "value" | "multiplier";
  ref: string;
  output?: string;
  value?: number;
}

export interface Condition {
  id: string;
  leftOperand: ConditionOperand;
  operator: string;
  rightOperand: ConditionOperand;
  role: "required" | "score" | "informative";
  weight: number;
  enabled: boolean;
}

export interface ConditionGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: Condition[];
}

export interface RiskRules {
  stopType: "fixed" | "atr" | "swing_low" | "percentage";
  stopValue: number;
  targets: { label: string; rrMultiple: number }[];
  trailingEnabled: boolean;
  trailingType: string;
  maxSpreadPercent: number;
  minLiquidity: number;
  slippageExpected: number;
}

export interface AlertRules {
  scoreMinForAlert: number;
  channels: string[];
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  cooldownMinutes: number;
  deduplication: boolean;
  customMessage: string | null;
  priority: "low" | "medium" | "high";
}

export interface StrategyDraft {
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

export const DEFAULT_RISK_RULES: RiskRules = {
  stopType: "atr",
  stopValue: 1.5,
  targets: [
    { label: "TP1", rrMultiple: 1.5 },
    { label: "TP2", rrMultiple: 2.5 },
  ],
  trailingEnabled: false,
  trailingType: "atr",
  maxSpreadPercent: 0.05,
  minLiquidity: 0,
  slippageExpected: 0.01,
};

export const DEFAULT_ALERT_RULES: AlertRules = {
  scoreMinForAlert: 60,
  channels: ["in_app"],
  quietHoursStart: null,
  quietHoursEnd: null,
  cooldownMinutes: 30,
  deduplication: true,
  customMessage: null,
  priority: "medium",
};

export const DEFAULT_SCORE_WEIGHTS: Record<string, number> = {
  backtest: 30,
  confluence: 20,
  volume: 15,
  spread: 10,
  trend: 10,
  risk_reward: 10,
  derivatives: 5,
};

export function createEmptyDraft(): StrategyDraft {
  return {
    name: "",
    description: "",
    market: "linear",
    exchange: "bybit",
    direction: "both",
    tags: [],
    symbols: [],
    timeframes: ["5"],
    alertMode: "candle_close",
    scoreMin: 60,
    minRr: 1.8,
    cooldownMinutes: 30,
    maxAlertsPerSymbolPerDay: 5,
    timeWindowStart: null,
    timeWindowEnd: null,
    priority: "medium",
    active: true,
    indicators: [],
    conditionGroups: [
      { id: crypto.randomUUID(), logic: "AND", conditions: [] },
    ],
    scoreWeights: { ...DEFAULT_SCORE_WEIGHTS },
    riskRules: { ...DEFAULT_RISK_RULES },
    alertRules: { ...DEFAULT_ALERT_RULES },
    version: 1,
  };
}

// Validation
export interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export function validateStrategy(draft: StrategyDraft): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!draft.name.trim()) {
    errors.push({ field: "name", message: "Nome é obrigatório", severity: "error" });
  }
  if (draft.symbols.length === 0) {
    errors.push({ field: "symbols", message: "Selecione pelo menos um ativo", severity: "error" });
  }
  if (draft.timeframes.length === 0) {
    errors.push({ field: "timeframes", message: "Selecione pelo menos um timeframe", severity: "error" });
  }
  if (draft.indicators.length === 0) {
    errors.push({ field: "indicators", message: "Adicione pelo menos um indicador", severity: "warning" });
  }
  if (draft.conditionGroups.every((g) => g.conditions.length === 0)) {
    errors.push({ field: "conditions", message: "Adicione pelo menos uma condição", severity: "warning" });
  }
  if (draft.scoreMin < 0 || draft.scoreMin > 100) {
    errors.push({ field: "scoreMin", message: "Score deve estar entre 0 e 100", severity: "error" });
  }
  if (draft.minRr <= 0) {
    errors.push({ field: "minRr", message: "R/R mínimo deve ser positivo", severity: "error" });
  }

  const totalWeight = Object.values(draft.scoreWeights).reduce((a, b) => a + b, 0);
  if (totalWeight !== 100) {
    errors.push({ field: "scoreWeights", message: `Pesos somam ${totalWeight}%, devem somar 100%`, severity: "warning" });
  }

  return errors;
}

// Summary generation
export function generateStrategySummary(draft: StrategyDraft): string {
  const parts: string[] = [];
  
  parts.push(`**${draft.name || "Sem nome"}**`);
  if (draft.description) parts.push(draft.description);
  
  parts.push(`\n**Mercado:** ${draft.market === "linear" ? "Perpétuo" : "Spot"} (${draft.exchange.toUpperCase()})`);
  parts.push(`**Direção:** ${draft.direction === "both" ? "Long & Short" : draft.direction.toUpperCase()}`);
  
  if (draft.symbols.length > 0) {
    parts.push(`**Ativos:** ${draft.symbols.join(", ")}`);
  }
  if (draft.timeframes.length > 0) {
    parts.push(`**Timeframes:** ${draft.timeframes.join(", ")}`);
  }

  if (draft.indicators.length > 0) {
    parts.push(`\n**Indicadores (${draft.indicators.length}):**`);
    draft.indicators.forEach((ind) => {
      const paramStr = Object.entries(ind.params).map(([k, v]) => `${k}=${v}`).join(", ");
      parts.push(`- ${ind.label || ind.type.toUpperCase()}(${paramStr}) [${ind.role}]`);
    });
  }

  if (draft.conditionGroups.some((g) => g.conditions.length > 0)) {
    parts.push(`\n**Condições:**`);
    draft.conditionGroups.forEach((group) => {
      if (group.conditions.length === 0) return;
      parts.push(`Grupo (${group.logic}):`);
      group.conditions.forEach((c) => {
        parts.push(`- ${c.leftOperand.ref} ${c.operator} ${c.rightOperand.ref || c.rightOperand.value}`);
      });
    });
  }

  parts.push(`\n**Score mínimo:** ${draft.scoreMin}`);
  parts.push(`**R/R mínimo:** ${draft.minRr}`);
  parts.push(`**Modo alerta:** ${draft.alertMode === "candle_close" ? "Candle fechado" : "Intrabar"}`);

  return parts.join("\n");
}
