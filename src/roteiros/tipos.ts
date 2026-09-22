// Modelo de dados do roteiro. Todo conteudo da apresentacao vive nos JSONs
// desta pasta; o player so conhece os TIPOS de cena definidos aqui.

export type Turma = '2A' | '2B' | '3A'

export const TURMAS: Turma[] = ['2A', '2B', '3A']

export type Sfx =
  | 'sonar'
  | 'alarme'
  | 'estatica'
  | 'ok'
  | 'pressurizacao'
  | 'bipe-timer'
  | 'casco'
  | 'vidro'
  | 'pulso'
  | 'impacto'
  | 'presenca'
  | 'whoosh'
  | 'agua'

/**
 * Estado do visor externo. Nasce `"ok"`, e o 3A o quebra: a pressao da zona
 * abissal racha o vidro e as cameras caem.
 *
 * Fica no roteiro, e nao numa flag escondida no codigo, porque e narrativa:
 * quem escreve a cena decide quando o visor racha e quando ele volta meio
 * consertado. Uma cena sem o campo HERDA o estado da anterior — o visor rachado
 * atravessa a apresentacao inteira, que e o ponto.
 */
export type Visor = 'ok' | 'rachado' | 'parcial'

export type Avanco = 'auto' | 'manual'

export type CenaBase = {
  /** unico na turma; vira o nome do mp3 */
  id: string
  /** auto = avanca quando o audio termina; manual = espera a seta direita */
  avanco?: Avanco
  sfx?: Sfx
  /**
   * Linhas ficticias do painel de log, intercaladas com as genericas enquanto
   * esta cena estiver no ar. So cenario — nao afetam o audio nem o avanco.
   */
  log?: string[]
  /**
   * Silhuetas que o orbe pode assumir nesta cena, na ordem em que o operador
   * percorre com M e N. A primeira entra ao abrir a cena. "esfera" e valido.
   * Sem o campo, o orbe fica em esfera.
   */
  formas?: string[]
  /**
   * Comandos que a propria IA digita no console, sem o operador. `atraso` conta
   * em ms a partir do inicio da cena. Serve pros momentos em que o roteiro quer
   * que "o sistema" acesse algo sozinho.
   */
  comandos?: ComandoRoteirizado[]
  /**
   * Profundidade-alvo em metros. O submarino desce (ou sobe) ate ela ao entrar
   * na cena, animado. Sem o campo, herda a profundidade da cena anterior.
   * E o unico input do cenario das cameras: elas nao sabem a turma, sabem os
   * metros.
   */
  profundidade?: number
  /** Mini-feeds das cameras externas. Padrao true. */
  cameras?: boolean
  /**
   * Estado do visor a partir desta cena. Sem o campo, herda o da cena anterior.
   */
  visor?: Visor
  /**
   * Liga as ameacas no mundo: rede fantasma, plastico a deriva e coral
   * branqueado, cada uma na sua faixa de profundidade. Usado so na subida do
   * 3A, depois de os grupos 3 e 4 falarem de poluicao — nao ha fala explicando,
   * porque os alunos acabaram de explicar. Sem o campo, herda da cena anterior.
   */
  ameacas?: boolean
}

/**
 * @deprecated Substituido pelas `acoes` por linha (ver `Linha`). Continua no
 * modelo so pra nao quebrar roteiro antigo; o Diretor converte na entrada.
 */
export type ComandoRoteirizado = {
  texto: string
  /**
   * ms depois do inicio da cena. E o relogio de emergencia: usado quando
   * `aposLinha` nao existe, ou quando a cena nao tem tempos reais de fala.
   */
  atraso: number
  /**
   * Indice da linha de `tela.linhas` depois da qual o comando dispara. Prefira
   * este campo a `atraso`: ele acompanha a fala mesmo que o texto mude e o mp3
   * fique mais longo. Um atraso em ms vira mentira no dia em que a professora
   * trocar uma palavra.
   */
  aposLinha?: number
  /**
   * Age sem abrir o console e sem a IA responder na legenda. E o modo certo
   * quando o comando acontece NO MEIO de uma fala: o console cobre a legenda e
   * a resposta rouba a vez da narracao.
   */
  discreto?: boolean
  /** mp3 opcional da resposta; sem ele, so legenda + sfx */
  audio?: string
}

/**
 * Prazo de validade de um painel ou de uma forma aberta pelo Diretor.
 *
 * Todo painel e toda forma automatica tem prazo declarado, e o Diretor fecha
 * sozinho quando ele vence. E essa a diferenca entre direcao e bagunca: sem
 * prazo, um painel fica esquecido na frente da plateia ate alguem notar.
 */
export type Prazo =
  | 'fimLinha'
  | 'fimCena'
  | { linha: number }
  | { segundos: number }

/** Quando a acao dispara: ao COMECAR a linha (padrao) ou ao terminar. */
export type Quando = 'inicio' | 'fim'

export type Acao =
  | { tipo: 'painel'; nome: string; args?: string; quando?: Quando; ate: Prazo }
  | { tipo: 'forma'; nome: string; quando?: Quando; ate: Prazo }
  | { tipo: 'fechar'; alvo: 'painel' | 'forma' | 'tudo'; quando?: Quando }
  | { tipo: 'mapa'; marcador: string; quando?: Quando; ate?: Prazo }
  | { tipo: 'camera'; qual: 1 | 2; quando?: Quando; ate: Prazo }
  | { tipo: 'sfx'; nome: string; quando?: Quando }
  | { tipo: 'mergulho'; para: number; quando?: Quando }

/**
 * Uma linha de fala. String simples continua valendo — a maioria das linhas
 * nao manda em nada e nao precisa virar objeto.
 */
export type Linha = string | { texto: string; acoes?: Acao[] }

/** O texto de uma linha, seja ela string ou objeto. */
export function textoDaLinha(linha: Linha): string {
  return typeof linha === 'string' ? linha : linha.texto
}

/** As acoes explicitas de uma linha, ou lista vazia. */
export function acoesDaLinha(linha: Linha): Acao[] {
  return typeof linha === 'string' ? [] : (linha.acoes ?? [])
}

export type CenaFala = CenaBase & {
  tipo: 'fala'
  tela: { titulo?: string; linhas: Linha[]; status?: string }
  /** ./audio/2a/<id>.mp3 */
  audio: string
}

/** Tela parada enquanto os alunos falam. */
export type CenaApresentacao = CenaBase & {
  tipo: 'apresentacao'
  tela: { titulo: string; status: string }
  /** fala de abertura opcional */
  audio?: string
  avanco: 'manual'
  /**
   * "palco": o orbe e grande e central, morfando nas `formas` da cena.
   * "discreto" (padrao): titulo grande, orbe pequeno no canto, `formas` ignorado.
   */
  orbe?: 'palco' | 'discreto'
}

/** Animacao do submarino se deslocando ate a proxima turma. */
export type CenaTransicao = CenaBase & {
  tipo: 'transicao'
  /** "2o ano B" */
  destino: string
  tela: { linhas: Linha[] }
  audio: string
}

export type CenaQuiz = CenaBase & {
  tipo: 'quiz'
  pergunta: string
  /** 2 a 4 alternativas */
  alternativas: string[]
  /** indice da alternativa correta */
  correta: number
  /** segundos do timer visual */
  tempo: number
  audio: { pergunta: string; acerto: string; erro: string }
  /** EXTENSAO: texto do feedback, exibido na legenda junto com o audio */
  falaAcerto?: string[]
  falaErro?: string[]
}

/** Verdadeiro ou falso. */
export type CenaVF = CenaBase & {
  tipo: 'vf'
  afirmacao: string
  resposta: boolean
  tempo: number
  audio: { afirmacao: string; acerto: string; erro: string }
  /** nome do subsistema que volta ao acertar (usado na pane do 3A) */
  restaura?: string
  /** EXTENSAO: texto do feedback, exibido na legenda junto com o audio */
  falaAcerto?: string[]
  falaErro?: string[]
}

export type CenaPane = CenaBase & {
  tipo: 'pane'
  /** ["SONAR", "NAVEGACAO", "COMUNICACAO"] */
  subsistemas: string[]
  /** EXTENSAO: status exibido ao lado de cada subsistema, na mesma ordem */
  estados?: string[]
  /** EXTENSAO: linhas ditas/exibidas na entrada da pane */
  falaEntrada?: string[]
  /** EXTENSAO: linhas ditas/exibidas no retorno (tecla R) */
  falaRetorno?: string[]
  audio: { entrada: string; retorno: string }
}

/**
 * Combate acustico: a plateia opera o sonar auxiliar e a IA dispara o pulso.
 *
 * O tipo e generico de proposito. A criatura e uma chave do bestiario, os
 * setores sao uma lista de rotulos e as falas sao dados — trocar o megalodonte
 * por outra coisa e trocar uma string e desenhar uma silhueta, sem tocar no
 * componente.
 */
export type CenaCombate = CenaBase & {
  tipo: 'combate'
  /** Chave do bestiario. So vira blip no sonar: a plateia nunca ve o bicho. */
  criatura: string
  /** Rotulos dos setores, na ordem das teclas 1, 2, 3... */
  setores: string[]
  rodadas: RodadaCombate[]
  falas: FalasCombate
  audio: AudioCombate
}

export type RodadaCombate = {
  /** Metros ate o contato quando a rodada comeca. Manda no tempo de eco. */
  distancia: number
  /** Segundos que o contato fica visivel no setor antes do impacto. */
  tempo: number
  /** Indice do setor. Sem o campo, sorteado — nenhuma rodada e decorada. */
  setor?: number
}

export type FalasCombate = {
  /** Uma por rodada, na ordem. */
  rodada: string[][]
  /** Sorteadas. Pelo menos uma de cada. */
  acerto: string[][]
  erro: string[][]
  /** Sonar vazio depois de um acerto, antes de o contato reaparecer. */
  perdido: string[][]
  /** O contato volta, mais perto, em outro setor. */
  retorno: string[][]
  /** Casco zerado antes do contato: a IA sobe forcada, nunca trava. */
  critico?: string[]
}

export type AudioCombate = {
  /** Um mp3 por rodada, mesma ordem de `falas.rodada`. */
  rodada: string[]
  acerto: string[]
  erro: string[]
  perdido: string[]
  retorno: string[]
  critico?: string
}

/**
 * Expedicao de identificacao (2A).
 *
 * O banco de especies corrompeu na descida e a IA precisa da tripulacao pra
 * recalibrar. A agua esta turva: so uma silhueta se movendo. A IA da pistas,
 * da MEDIANA pra FACIL, e a plateia grita o nome. Acertou, a agua limpa.
 *
 * E o contrario do quiz que ela substitui: ninguem escolhe entre alternativas,
 * ninguem erra. O que se mede e QUANDO a sala reconheceu — e a recompensa e
 * ver o bicho.
 */
export type CenaIdentificacao = CenaBase & {
  tipo: 'identificacao'
  especies: EspecieIdentificacao[]
  falas: {
    /** Sorteada na aparicao de cada especie. */
    inicio: string[][]
    acerto: string[][]
    /** Ninguem acertou e o operador revelou. */
    revelado: string[][]
  }
  audio: {
    inicio: string[]
    acerto: string[]
    revelado: string[]
  }
}

export type EspecieIdentificacao = {
  /** Chave do bestiario / PNG / ficha. */
  id: string
  /** Como a plateia vai dizer. */
  nome: string
  /** Sinonimos aceitos. Referencia pro operador no overlay de ajuda. */
  aceitos: string[]
  /** Tres pistas, da MEDIANA pra FACIL. A terceira quase entrega. */
  pistas: string[]
  /** Um mp3 por pista, mesma ordem. */
  audioPistas: string[]
  /** Segundos entre pistas. */
  intervaloPistas: number
  profundidade?: number
  ambiente?: 'recife' | 'mangue' | 'aberto'
  /** Quanto o cache sobe ao identificar. A soma das quatro fecha o total. */
  incrementoCache: number
}

/** Quanto o cache precisa alcancar. A soma dos incrementos bate com isto. */
export const CACHE_TOTAL = 240_112

/**
 * O olho.
 *
 * A unica cena em que a plateia ve a criatura, e ela ve UM olho no facho do
 * farol. Nao tem legenda, nao tem avanco manual e nao tem fala: a IA so volta a
 * falar depois que o visor ja quebrou.
 *
 * O desenho e procedural, nao imagem. Nao por purismo -- e que a cena inteira
 * depende de a pupila CONTRAIR quando a luz bate, e isso e animacao, nao PNG.
 *
 * Ao terminar, o visor global vira `rachado` e fica: e daqui pra frente que a
 * IA esta cega, e e por isso que ela precisa da plateia no combate.
 */
export type CenaOlho = CenaBase & {
  tipo: 'olho'
  /** Chave do bestiario. Hoje so nomeia o dono do olho no log e no dossie. */
  criatura: string
  /** Quanto o olho fica no facho, em ms. Depois dele vem a rachadura. */
  duracao: number
}

/**
 * Tela final estatica. Nao avanca sozinha e nao tem proxima cena: e onde a
 * apresentacao termina e fica, enquanto a plateia aplaude.
 */
export type CenaFim = CenaBase & {
  tipo: 'fim'
  tela: { titulo: string; subtitulo: string; nota?: string }
}

export type Cena =
  | CenaFala
  | CenaIdentificacao
  | CenaApresentacao
  | CenaTransicao
  | CenaQuiz
  | CenaVF
  | CenaPane
  | CenaCombate
  | CenaOlho
  | CenaFim

export type Roteiro = {
  turma: Turma
  cenas: Cena[]
}
