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
  /** Antes do gesto inicial: o canal já está aberto, mas quem age é o teclado
   *  do Chromebook — o celular não tem nada pra fazer ainda. */
  | 'ativacao'
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
  emergencia?: { casco: boolean; sonar: boolean; com: boolean }
  combate?: { casco: number; contato: number; setor: 1 | 2 | 3; recarga: number }
}

/** Estado da conexão, pro pontinho no rodapé do HUD. */
export type StatusRemoto = 'desligado' | 'reconectando' | 'ligado'
