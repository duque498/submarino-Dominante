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

/**
 * Sementes da pane, por cena.
 *
 * `agua` desce linearmente do primeiro valor ao segundo enquanto a cena esta
 * no ar, e aparece na barra do HUD. `avisos` entram no log espacados pela
 * cena. Sao dois valores e uma lista de textos de proposito: qualquer coisa
 * mais esperta viraria um sistema de eventos que so esta cena usaria.
 */
export type Sementes = {
  /** [inicio, fim] em graus Celsius. */
  agua?: [number, number]
  /** Linhas pro log, espacadas pela duracao da cena. Prefixe com "WARN:". */
  avisos?: string[]
}

/** Um subsistema que a fala dos alunos religa, acionado pelo operador. */
export type Reparo = {
  tecla: '1' | '2' | '3'
  /** Precisa estar em `subsistemas` da cena de emergencia. */
  subsistema: string
  fala: string[]
  audio: string
}

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
   * Sementes da pane: o que muda na tela ANTES de a IA quebrar.
   *
   * O 2B quebra no fim do grupo 2, e uma pane que chega do nada e um susto,
   * nao uma consequencia. Durante o grupo 1 a agua esfria na leitura do HUD e
   * o log solta avisos ambar espacados. Sem som e sem fala: a plateia nao tem
   * que PERCEBER, tem que reconhecer depois que ja estava ali.
   */
  sementes?: Sementes
  /**
   * Reparos que o operador pode acionar NESTA cena, um por tecla.
   *
   * A fala dos alunos e que conserta o submarino — mas quem sabe quando eles
   * chegaram no trecho certo e o operador, nao o relogio. Por isso e tecla, e
   * nao temporizador: o grupo pode demorar o que quiser no empuxo.
   */
  reparos?: Reparo[]
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
   * Rajada no log de sistemas, na frente da fila.
   *
   * Linha terminada em "..." ganha barra de progresso, do mesmo jeito que as
   * do pool generico. `nivel` forca a cor quando o texto nao a denuncia
   * sozinho (o painel ja pinta ERR e WARN pelo prefixo).
   */
  | { tipo: 'log'; linhas: string[]; nivel?: 'err' | 'warn' | 'ok'; quando?: Quando }
  /**
   * Mexe no orbe durante a fala.
   *
   * `estado` troca a paleta e o comportamento ('processando' pulsa, por
   * exemplo). `efeito` e momentaneo e volta sozinho: 'parar' congela a
   * rotacao, 'tremor' da um solavanco curto, 'lento' arrasta.
   */
  | {
      tipo: 'orbe'
      estado?: EstadoOrbe
      efeito?: 'parar' | 'tremor' | 'lento'
      /** Duracao do efeito em ms. Padrao 1000. */
      ms?: number
      quando?: Quando
    }
  /**
   * Nivel da trilha, em dB relativos ao volume de repouso dela.
   *
   * 0 e o normal, -12 e um fundo que mal se nota, `null` para a trilha. Serve
   * pras cenas em que a musica entra por baixo da fala e sobe num ponto
   * marcado do texto.
   */
  | { tipo: 'trilha'; db: number | null; ms?: number; quando?: Quando }

/** Paleta e comportamento do orbe. */
export type EstadoOrbe = 'ocioso' | 'falando' | 'processando' | 'pane'

/**
 * Destaque visual de uma linha na legenda.
 *
 * Existe pras falas em que o TEXTO e o acontecimento — o nome que a IA acabou
 * de achar, a pergunta que ela faz a si mesma. Sem isto essas linhas passam
 * com o mesmo peso do resto e a plateia nao percebe que algo mudou.
 */
export type EnfaseLinha = {
  /** Multiplicador do tamanho da fonte. 1.4 = 140%. */
  escala?: number
  /** `false` desliga a materializacao letra a letra nesta linha. */
  glitch?: boolean
}

/*
 * NAO existe "segurar a legenda por N ms".
 *
 * Tentei: a linha ficava mais tempo na tela empurrando a ENTRADA da seguinte.
 * Mas o intervalo entre duas falas e silencio que pertence ao comeco da
 * proxima — medido no `dossie`, segurar a fala 11 fez a legenda da 12 entrar
 * 766 ms DEPOIS de a voz ja estar dizendo a 12. Legenda que mente sobre o que
 * esta sendo dito e pior que legenda rapida.
 *
 * Pra uma linha ficar mais tempo na tela, o tempo tem que existir no AUDIO:
 * use `pausaDepois` nela. A legenda segue os offsets reais e respeita sozinha.
 */

/**
 * Uma linha de fala. String simples continua valendo — a maioria das linhas
 * nao manda em nada e nao precisa virar objeto.
 *
 * `prosodia` e `pausaDepois` sao lidos pelo gerar_audios.py: a primeira muda
 * ritmo e tom so desta fala, a segunda insere silencio depois dela. A pausa
 * entra nos offsets do tempos.json, entao a legenda a respeita sozinha.
 */
export type Linha =
  | string
  | {
      texto: string
      /**
       * O que a VOZ diz, quando difere do que a legenda mostra.
       *
       * Existe pro nome que se escreve de um jeito e se fala de outro. O
       * fonemizador do TTS le "Otodus" com acento na ultima silaba
       * ("otoDUS"); escrevendo "Otodus" na tela e "Otôdus" aqui, a plateia le
       * o nome certo e ouve o nome certo.
       *
       * Em LISTA, e a mesma frase dita em pedacos, com uma batida curta
       * entre eles. Nenhuma pontuacao produz pausa dentro de uma frase no
       * kokoro — medido: reticencias, virgula, travessao e ponto dao todos
       * zero silencio interno. Sintetizar os pedacos separados e a unica
       * forma de a IA respirar no meio da frase, e respirar no meio da frase
       * e metade do que faz uma fala soar humana.
       *
       * A legenda continua mostrando UMA linha: o offset dela vai do comeco
       * do primeiro pedaco ao fim do ultimo.
       *
       * NAO serve pra reescrever a fala: sao as mesmas palavras, na mesma
       * ordem, na grafia que o sintetizador entende.
       */
      fala?: string | string[]
      acoes?: Acao[]
      enfase?: EnfaseLinha
      prosodia?: { rate?: string; pitch?: string; dinamica?: 'preservada' }
      pausaDepois?: number
    }

/** O texto de uma linha, seja ela string ou objeto. */
export function textoDaLinha(linha: Linha): string {
  return typeof linha === 'string' ? linha : linha.texto
}

/** As acoes explicitas de uma linha, ou lista vazia. */
export function acoesDaLinha(linha: Linha): Acao[] {
  return typeof linha === 'string' ? [] : (linha.acoes ?? [])
}

/** O destaque de uma linha, ou null. */
export function enfaseDaLinha(linha: Linha): EnfaseLinha | null {
  return typeof linha === 'string' ? null : (linha.enfase ?? null)
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
  /**
   * O que a IA conta sobre o bicho depois que a sala acerta.
   *
   * E o pagamento da dinamica. A plateia acabou de reconhecer o animal e esta
   * olhando pra ele nitido na tela — e o unico instante da apresentacao em que
   * ela quer ouvir sobre aquilo. Uma confirmacao seca ("identificacao
   * confirmada") desperdica esse instante.
   */
  curiosidade: string[]
  audioCuriosidade: string
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
 * A quebra do 2B: pane PARCIAL e persistente.
 *
 * Diferente da pane global (`P`/`R`), que congela a apresentacao inteira e
 * espera o operador reiniciar. Aqui a apresentacao CONTINUA — quem esta
 * avariado e o submarino. Os grupos 3 e 4 apresentam com tres luzes vermelhas
 * no canto e a moldura pulsando, e e a fala deles que religa cada sistema.
 *
 * Por isso ela e uma cena e nao uma tecla: a quebra tem hora marcada no
 * roteiro (o grupo 2 acabou de dizer que a IA pode errar) e o estado dela
 * atravessa as cenas seguintes ate o hidrofone.
 */
export type CenaEmergencia = CenaBase & {
  tipo: 'emergencia'
  /** ["CASCO", "SONAR", "COMUNICACAO"] — a ordem e a das luzes. */
  subsistemas: string[]
  /** Tela de falha, travada alguns segundos. */
  tela: { linhas: string[] }
  /** As falas da queda, ditas antes de a tela travar. */
  falasQueda: string[]
  /** As falas do modo reduzido, ditas quando a tela destrava. */
  falasRetorno: string[]
  audio: { queda: string; retorno: string }
}

/**
 * Hidrofone: a plateia identifica tres sons.
 *
 * E a irma da identificacao do 2A, com uma troca de sentido: la a plateia
 * RECONHECE pela forma, aqui pelo som. E o terceiro som nao e so mais um — e
 * o canto da baleia, cuja frequencia a IA usa pra alcancar a superficie. A
 * dinamica devolve a comunicacao ao submarino.
 *
 * Sem erro, sem timer e sem barra: a unica pressao e a luz vermelha da
 * comunicacao no canto.
 */
export type CenaHidrofone = CenaBase & {
  tipo: 'hidrofone'
  sons: SomHidrofone[]
  falas: {
    /** Sorteada na entrada de cada som. */
    inicio: string[][]
    /** Uma por som, na ordem: leva o dado da distancia. */
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

export type SomHidrofone = {
  /** "chuva" | "navio" | "baleia". Escolhe o sintetizador e o icone. */
  id: string
  nome: string
  /** Sinonimos aceitos. Referencia pro operador no overlay de ajuda. */
  aceitos: string[]
  /** UMA pista, facil, dita 4 s depois de o som comecar. */
  pista: string
  audioPista: string
  /** Aparece no mapa ao identificar, e na fala de acerto. */
  distanciaKm: number
  origem: 'superficie' | 'navio' | 'animal'
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
  | CenaEmergencia
  | CenaHidrofone
  | CenaCombate
  | CenaOlho
  | CenaFim

export type Roteiro = {
  turma: Turma
  cenas: Cena[]
}
