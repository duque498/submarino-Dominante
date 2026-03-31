// Scoring engine — calculates weighted scores from indicator data

export interface ScoreBlock {
  name: string;
  label: string;
  description: string;
  defaultWeight: number;
}

export const SCORE_BLOCKS: ScoreBlock[] = [
  { name: "backtest", label: "Backtest / Histórico", description: "Performance histórica da estratégia no ativo", defaultWeight: 30 },
  { name: "confluence", label: "Confluência de Indicadores", description: "Quantos indicadores confirmam o sinal", defaultWeight: 20 },
  { name: "volume", label: "Volume e Liquidez", description: "Volume relativo e profundidade do book", defaultWeight: 15 },
  { name: "spread", label: "Spread e Execução", description: "Qualidade de execução e custo operacional", defaultWeight: 10 },
  { name: "trend", label: "Tendência TF Maior", description: "Alinhamento com timeframe superior", defaultWeight: 10 },
  { name: "risk_reward", label: "Risco / Retorno", description: "Proporção entre alvo e stop", defaultWeight: 10 },
  { name: "derivatives", label: "Derivativos (OI/Funding)", description: "Open Interest e funding rate confirmando", defaultWeight: 5 },
];

export interface BlockScore {
  block: string;
  score: number; // 0-100
  weight: number; // 0-100
  details?: string;
}

export interface SignalScore {
  total: number; // 0-100
  blocks: BlockScore[];
  passed: boolean;
  minScore: number;
}

/**
 * Calculate weighted total from block scores.
 * Each block contributes (score * weight / totalWeight) to the final score.
 */
export function calculateTotalScore(blocks: BlockScore[]): number {
  const totalWeight = blocks.reduce((sum, b) => sum + b.weight, 0);
  if (totalWeight === 0) return 0;
  const raw = blocks.reduce((sum, b) => sum + (b.score * b.weight), 0) / totalWeight;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Evaluate whether a signal passes the minimum score threshold.
 */
export function evaluateSignal(blocks: BlockScore[], minScore: number): SignalScore {
  const total = calculateTotalScore(blocks);
  return {
    total,
    blocks,
    passed: total >= minScore,
    minScore,
  };
}

/**
 * Score a risk/reward ratio.
 * >= 3.0 = 100, >= 2.5 = 85, >= 2.0 = 70, >= 1.5 = 50, >= 1.0 = 30, < 1.0 = 10
 */
export function scoreRiskReward(rr: number): number {
  if (rr >= 3.0) return 100;
  if (rr >= 2.5) return 85;
  if (rr >= 2.0) return 70;
  if (rr >= 1.5) return 50;
  if (rr >= 1.0) return 30;
  return 10;
}

/**
 * Score volume relative to its SMA.
 * ratio >= 3.0 = 100, >= 2.0 = 80, >= 1.5 = 65, >= 1.0 = 45, < 1.0 = 20
 */
export function scoreVolumeRatio(ratio: number): number {
  if (ratio >= 3.0) return 100;
  if (ratio >= 2.0) return 80;
  if (ratio >= 1.5) return 65;
  if (ratio >= 1.0) return 45;
  return 20;
}

/**
 * Score spread quality.
 * < 0.01% = 100, < 0.03% = 80, < 0.05% = 60, < 0.1% = 40, >= 0.1% = 15
 */
export function scoreSpread(spreadPercent: number): number {
  if (spreadPercent < 0.01) return 100;
  if (spreadPercent < 0.03) return 80;
  if (spreadPercent < 0.05) return 60;
  if (spreadPercent < 0.1) return 40;
  return 15;
}

/**
 * Score confluence: percentage of conditions met.
 */
export function scoreConfluence(passedCount: number, totalRequired: number): number {
  if (totalRequired === 0) return 50;
  return Math.round((passedCount / totalRequired) * 100);
}
