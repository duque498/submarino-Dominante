// Modelo de dados do roteiro. Todo conteudo da apresentacao vive nos JSONs
// desta pasta; o player so conhece os TIPOS de cena definidos aqui.

export type Turma = '2A' | '2B' | '3A'

export const TURMAS: Turma[] = ['2A', '2B', '3A']

export type Sfx = 'sonar' | 'alarme' | 'estatica' | 'ok'

export type Avanco = 'auto' | 'manual'

export type CenaBase = {
  /** unico na turma; vira o nome do mp3 */
  id: string
  /** auto = avanca quando o audio termina; manual = espera a seta direita */
  avanco?: Avanco
  sfx?: Sfx
}

export type CenaFala = CenaBase & {
  tipo: 'fala'
  tela: { titulo?: string; linhas: string[]; status?: string }
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
}

/** Animacao do submarino se deslocando ate a proxima turma. */
export type CenaTransicao = CenaBase & {
  tipo: 'transicao'
  /** "2o ano B" */
  destino: string
  tela: { linhas: string[] }
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
