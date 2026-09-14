/**
 * Linhas genéricas do painel de log. São puramente cenográficas: nenhuma delas
 * reflete estado real do app. Cada entrada é uma função pra que os números
 * variem a cada aparição, dentro de faixas plausíveis.
 */
export type GeradorLog = () => string

const n = (min: number, max: number, casas = 0) =>
  (min + Math.random() * (max - min)).toFixed(casas)

const escolher = <T,>(opcoes: T[]): T => opcoes[Math.floor(Math.random() * opcoes.length)]

const RUMOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

export const POOL_GENERICO: GeradorLog[] = [
  () => `SONAR: varredura 360° concluída em ${n(0.8, 3.4, 1)} s`,
  () => `Pressão externa: ${n(4.2, 61.0, 1)} atm`,
  () => `Temperatura da água: ${n(1.8, 14.6, 1)} °C`,
  () => `Salinidade: ${n(33.1, 37.4, 2)} PSU`,
  () => `Corrente detectada: ${n(0.2, 2.6, 1)} nós ${escolher(RUMOS)}`,
  () => `Acessando banco de dados oceanográfico...`,
  () => `Cache de espécies: ${n(238000, 241500)} registros`,
  () => `Módulo de comunicação: OK`,
  () => `Sincronizando com estação de superfície...`,
  () => `Integridade do casco: ${n(97.2, 100, 1)} %`,
  () => `Reserva de oxigênio: ${n(78, 99)} %`,
  () => `Células de energia: ${n(62, 98)} % — autonomia ${n(6, 22, 1)} h`,
  () => `Lastro estabilizado em ${n(0.4, 4.8, 1)} t`,
  () => `Propulsão: ${n(18, 74)} % da potência nominal`,
  () => `Giroscópio recalibrado (desvio ${n(0.01, 0.42, 2)}°)`,
  () => `Sonar passivo: ${n(0, 6, 0)} contato(s) a ${n(120, 1800)} m`,
  () => `Eco classificado como biológico (confiança ${n(71, 99)} %)`,
  () => `Turbidez: ${n(0.4, 9.8, 1)} NTU`,
  () => `Oxigênio dissolvido: ${n(2.1, 8.9, 1)} mg/L`,
  () => `pH da amostra: ${n(7.72, 8.24, 2)}`,
  () => `Luminosidade ambiente: ${n(0, 42, 1)} lux`,
  () => `Câmera externa ${escolher(['1', '2', '3'])}: foco automático ajustado`,
  () => `Amostra coletada: frasco ${escolher(['A', 'B', 'C', 'D'])}${n(1, 9)}`,
  () => `Registrando trajetória no diário de bordo`,
  () => `Filtro de água: ciclo ${n(1, 12)} concluído`,
  () => `Bomba de circulação: ${n(1100, 1750)} rpm`,
  () => `Verificando vedação das escotilhas... OK`,
  () => `Mapa batimétrico atualizado (${n(4, 96)} setores)`,
  () => `Densidade da coluna d'água: ${n(1022, 1031)} kg/m³`,
  () => `Hidrofone: ruído de fundo ${n(38, 74)} dB`,
  () => `Sinal acústico identificado a ${n(0.4, 9.6, 1)} km`,
  () => `Compensando deriva lateral (${n(0.1, 1.9, 1)}°)`,
  () => `Escaneando fundo marinho a ${n(20, 320)} m do casco`,
  () => `Índice de clorofila-a: ${n(0.02, 4.8, 2)} mg/m³`,
  () => `Consultando registros de expedições anteriores...`,
  () => `Telemetria enviada — ${n(12, 480)} kB`,
  () => `Relógio de bordo sincronizado (UTC-3)`,
  () => `Sensor de profundidade: leitura estável`,
  () => `Análise de sedimento em andamento (${n(5, 95)} %)`,
  () => `Rota recalculada: ${n(2, 14)} pontos de referência`,
  () => `Sistema de emergência em espera`,
  () => `Compactando dados da expedição... ${n(10, 99)} %`,
]

/** Usado quando o painel entra em modo de erro (pane). */
export const POOL_ERRO: GeradorLog[] = [
  () => `ERR: sonar sem resposta`,
  () => `WARN: pressão fora do limite (${n(62, 94, 1)} atm)`,
  () => `ERR: perda de sinal com a estação de superfície`,
  () => `ERR: módulo de navegação não responde`,
  () => `WARN: oscilação na célula de energia ${n(1, 4)}`,
  () => `ERR: timeout ao ler sensor de profundidade`,
  () => `WARN: integridade do casco em ${n(81, 94, 1)} %`,
  () => `ERR: falha ao gravar no diário de bordo`,
  () => `WARN: temperatura do compartimento ${n(38, 56, 1)} °C`,
  () => `ERR: barramento de dados instável`,
  () => `WARN: reserva de oxigênio abaixo do previsto`,
  () => `ERR: rota indisponível — sem referência`,
  () => `WARN: hidrofone saturado`,
  () => `ERR: checksum inválido no pacote de telemetria`,
]

export function sortearGenerico(): string {
  return escolher(POOL_GENERICO)()
}

export function sortearErro(): string {
  return escolher(POOL_ERRO)()
}
