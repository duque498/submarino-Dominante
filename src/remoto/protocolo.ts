/**
 * O que trafega entre o celular e o Chromebook.
 *
 * Os dois lados são escritos à mão em lugares diferentes (aqui em TypeScript,
 * lá em JavaScript solto dentro do `controle.html`), então este arquivo é o
 * contrato: mexeu aqui, mexe lá.
 *
 * Tudo é `broadcast` do Realtime — nenhuma tabela, nenhuma escrita, nada que
 * sobreviva ao fim da apresentação.
 */

/** Celular -> Chromebook: uma tecla, exatamente como o teclado físico mandaria. */
export type Cmd = { tecla: string }

/** Celular -> Chromebook: uma linha de console, como se digitada depois do `/`. */
export type Comando = { texto: string }

/** Celular -> Chromebook: "tem alguém aí?". O `id` volta no pong. */
export type Ping = { id: string }

/** Chromebook -> celular: "estou aqui, e sou esta turma nesta cena". */
export type Pong = { id: string; turma: string; cenaId: string }

/** Em que "tela" o celular deve se desenhar. Sai do tipo da cena. */
export type ModoRemoto =
  /**
   * Antes do gesto físico: o canal já está aberto e o PIN à vista, mas o
   * celular não tem o que fazer — o passo é no teclado do Chromebook.
   */
  | 'ativacao'
  /** Já ativado e parado, esperando o → que inicia a IA. Daqui o celular age. */
  | 'espera'
  | 'apresentacao'
  | 'quiz'
  | 'identificacao'
  | 'hidrofone'
  | 'combate'
  | 'emergencia'
  | 'mergulho'

/**
 * Chromebook -> celular: tudo que o celular precisa pra se desenhar.
 *
 * Vai inteiro a cada 2 s, e também a cada troca de cena. É pequeno e é
 * idempotente de propósito: um celular que entra no meio da apresentação fica
 * certo no primeiro que chegar, sem precisar de histórico.
 */
export type EstadoRemoto = {
  turma: string
  cenaId: string
  cenaTitulo: string
  proximaTitulo: string
  /** A colinha: o que o operador tem que fazer AGORA. */
  instrucao: string
  /** Só estas teclas ficam acesas no celular. */
  teclasDisponiveis: string[]
  modo: ModoRemoto
  /**
   * O navegador do Chromebook já liberou o áudio?
   *
   * Vai no estado porque é a única coisa que o celular NÃO consegue resolver
   * sozinho: uma tecla mandada daqui não conta como gesto do usuário pro
   * Chrome, então há um passo da apresentação que é obrigatoriamente físico, e
   * o operador precisa ver isso no celular antes de tentar.
   */
  audioDestravado: boolean
  /** Recado momentâneo pro celular. Só existe quando há algo a dizer. */
  aviso?: 'audio-bloqueado'
  emergencia?: { casco: boolean; sonar: boolean; com: boolean }
  combate?: { casco: number; contato: number; setor: 1 | 2 | 3; recarga: number }
}

/** Estado da conexão, pro pontinho no rodapé do HUD. */
export type StatusRemoto = 'desligado' | 'reconectando' | 'ligado'
