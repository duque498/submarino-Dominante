// Modelo de dados do roteiro. Todo conteudo da apresentacao vive nos JSONs
// desta pasta; o player so conhece os TIPOS de cena definidos aqui.

export type Turma = '2A' | '2B' | '3A'

export const TURMAS: Turma[] = ['2A', '2B', '3A']

export type Sfx = 'sonar' | 'alarme' | 'estatica' | 'ok' | 'pressurizacao' | 'casco'

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

export type Cena =
  | CenaFala
  | CenaApresentacao
  | CenaTransicao
  | CenaQuiz
  | CenaVF
  | CenaPane

export type Roteiro = {
  turma: Turma
  cenas: Cena[]
}
