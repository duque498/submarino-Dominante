/**
 * Linhas do painel de log. São puramente cenográficas: nenhuma delas reflete
 * estado real do app.
 *
 * Três formatos, porque o painel anima cada um de um jeito:
 *  - "texto": linha pronta, só digitada;
 *  - "progresso": nasce em 0 % e sobe até o alvo, com minibarra;
 *  - "valor": a leitura fica oscilando alguns segundos antes de congelar.
 */

export type EntradaLog =
  | { tipo: 'texto'; gerar: () => string }
  | { tipo: 'progresso'; rotulo: string }
  | {
      tipo: 'valor'
      rotulo: string
      faixa: [number, number]
      unidade: string
      casas: number
    }

const n = (min: number, max: number, casas = 0) =>
  (min + Math.random() * (max - min)).toFixed(casas)

const escolher = <T,>(opcoes: T[]): T => opcoes[Math.floor(Math.random() * opcoes.length)]

const RUMOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

const texto = (gerar: () => string): EntradaLog => ({ tipo: 'texto', gerar })

export const POOL_GENERICO: EntradaLog[] = [
  // --- leituras que ficam oscilando ---
  { tipo: 'valor', rotulo: 'Pressão externa', faixa: [4.2, 61], unidade: 'atm', casas: 1 },
  { tipo: 'valor', rotulo: 'Temperatura da água', faixa: [1.8, 14.6], unidade: '°C', casas: 1 },
  { tipo: 'valor', rotulo: 'Salinidade', faixa: [33.1, 37.4], unidade: 'PSU', casas: 2 },
  { tipo: 'valor', rotulo: 'Oxigênio dissolvido', faixa: [2.1, 8.9], unidade: 'mg/L', casas: 1 },
  { tipo: 'valor', rotulo: 'pH da amostra', faixa: [7.72, 8.24], unidade: '', casas: 2 },
  { tipo: 'valor', rotulo: 'Turbidez', faixa: [0.4, 9.8], unidade: 'NTU', casas: 1 },
  { tipo: 'valor', rotulo: 'Luminosidade ambiente', faixa: [0, 42], unidade: 'lux', casas: 1 },
  { tipo: 'valor', rotulo: 'Ruído de fundo', faixa: [38, 74], unidade: 'dB', casas: 0 },
  { tipo: 'valor', rotulo: 'Propulsão', faixa: [18, 74], unidade: '% da potência', casas: 0 },
  { tipo: 'valor', rotulo: 'Reserva de oxigênio', faixa: [78, 99], unidade: '%', casas: 0 },
  { tipo: 'valor', rotulo: 'Integridade do casco', faixa: [97.2, 100], unidade: '%', casas: 1 },

  // --- tarefas com progresso ---
  { tipo: 'progresso', rotulo: 'Compactando dados da expedição' },
  { tipo: 'progresso', rotulo: 'Análise de sedimento' },
  { tipo: 'progresso', rotulo: 'Indexando catálogo de espécies' },
  { tipo: 'progresso', rotulo: 'Mapa batimétrico: atualizando setores' },
  { tipo: 'progresso', rotulo: 'Sincronizando com estação de superfície' },
  { tipo: 'progresso', rotulo: 'Calibrando array do sonar' },
  { tipo: 'progresso', rotulo: 'Transferindo telemetria' },

  // --- linhas simples ---
  texto(() => `SONAR: varredura 360° concluída em ${n(0.8, 3.4, 1)} s`),
  texto(() => `Corrente detectada: ${n(0.2, 2.6, 1)} nós ${escolher(RUMOS)}`),
  texto(() => `Acessando banco de dados oceanográfico...`),
  texto(() => `Cache de espécies: ${n(238000, 241500)} registros`),
  texto(() => `Módulo de comunicação: OK`),
  texto(() => `Células de energia: ${n(62, 98)} % — autonomia ${n(6, 22, 1)} h`),
  texto(() => `Lastro estabilizado em ${n(0.4, 4.8, 1)} t`),
  texto(() => `Giroscópio recalibrado (desvio ${n(0.01, 0.42, 2)}°)`),
  texto(() => `Sonar passivo: ${n(0, 6, 0)} contato(s) a ${n(120, 1800)} m`),
  texto(() => `Eco classificado como biológico (confiança ${n(71, 99)} %)`),
  texto(() => `Câmera externa ${escolher(['1', '2', '3'])}: foco automático ajustado`),
  texto(() => `Amostra coletada: frasco ${escolher(['A', 'B', 'C', 'D'])}${n(1, 9)}`),
  texto(() => `Registrando trajetória no diário de bordo`),
  texto(() => `Filtro de água: ciclo ${n(1, 12)} concluído`),
  texto(() => `Bomba de circulação: ${n(1100, 1750)} rpm`),
  texto(() => `Verificando vedação das escotilhas... OK`),
  texto(() => `Densidade da coluna d'água: ${n(1022, 1031)} kg/m³`),
  texto(() => `Sinal acústico identificado a ${n(0.4, 9.6, 1)} km`),
  texto(() => `Compensando deriva lateral (${n(0.1, 1.9, 1)}°)`),
  texto(() => `Escaneando fundo marinho a ${n(20, 320)} m do casco`),
  texto(() => `Índice de clorofila-a: ${n(0.02, 4.8, 2)} mg/m³`),
  texto(() => `Consultando registros de expedições anteriores...`),
  texto(() => `Relógio de bordo sincronizado (UTC-3)`),
  texto(() => `Sensor de profundidade: leitura estável`),
  texto(() => `Rota recalculada: ${n(2, 14)} pontos de referência`),
  texto(() => `Sistema de emergência em espera`),
]

/** Usado quando o painel entra em modo de erro (pane). */
export const POOL_ERRO: EntradaLog[] = [
  texto(() => `ERR: sonar sem resposta`),
  texto(() => `WARN: pressão fora do limite (${n(62, 94, 1)} atm)`),
  texto(() => `ERR: perda de sinal com a estação de superfície`),
  texto(() => `ERR: módulo de navegação não responde`),
  texto(() => `WARN: oscilação na célula de energia ${n(1, 4)}`),
  texto(() => `ERR: timeout ao ler sensor de profundidade`),
  texto(() => `WARN: integridade do casco em ${n(81, 94, 1)} %`),
  texto(() => `ERR: falha ao gravar no diário de bordo`),
  texto(() => `WARN: temperatura do compartimento ${n(38, 56, 1)} °C`),
  texto(() => `ERR: barramento de dados instável`),
  texto(() => `WARN: reserva de oxigênio abaixo do previsto`),
  texto(() => `ERR: rota indisponível — sem referência`),
  texto(() => `WARN: hidrofone saturado`),
  texto(() => `ERR: checksum inválido no pacote de telemetria`),
]

/** Rajada disparada quando o operador manda um comando pelo console. */
export const POOL_COMANDO: string[] = [
  'Interpretando comando...',
  'Consultando módulo de reconhecimento...',
  'Resolvendo referência no catálogo...',
  'Alocando buffer de renderização...',
  'Validando permissão de operador... OK',
  'Encaminhando para o núcleo de bordo...',
]

/** Evita sortear a mesma entrada duas vezes seguidas: repetição denuncia o truque. */
function sortearSemRepetir(pool: EntradaLog[], ultimo: { indice: number }): EntradaLog {
  let indice = Math.floor(Math.random() * pool.length)
  if (indice === ultimo.indice) indice = (indice + 1) % pool.length
  ultimo.indice = indice
  return pool[indice]
}

const ultimoGenerico = { indice: -1 }
const ultimoErro = { indice: -1 }

export const sortearGenerico = () => sortearSemRepetir(POOL_GENERICO, ultimoGenerico)
export const sortearErro = () => sortearSemRepetir(POOL_ERRO, ultimoErro)
