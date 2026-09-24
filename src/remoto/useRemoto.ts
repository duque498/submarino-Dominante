import { useEffect, useRef, useState } from 'react'
import { criarReceptor } from './receptor'
import type { EstadoRemoto, StatusRemoto } from './protocolo'

/**
 * Entrega a tecla do celular pelo MESMO caminho da tecla física.
 *
 * Um `KeyboardEvent` de verdade na janela cai no listener do `useTeclado`, que
 * é quem já sabe tudo: quando o console está aberto o listener nem está
 * pendurado (e a tecla é engolida, como seria a física), o painel que captura
 * teclado recebe igual, e o cooldown do pulso no combate continua sendo o do
 * combate. Nenhuma regra é reescrita aqui — é esse o ponto.
 */
export function digitarRemoto(tecla: string): void {
  try {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: tecla, bubbles: true, cancelable: true }),
    )
  } catch {
    /* navegador sem construtor de KeyboardEvent: o teclado físico segue */
  }
}

export type OpcoesUseRemoto = {
  turma: string
  codigo: string
  /** Lê o estado atual. Precisa ser barato: roda a cada 2 s. */
  lerEstado: () => EstadoRemoto | null
  /** Executa uma linha de console, como se digitada depois do `/`. */
  aoComando: (texto: string) => void
  /** Ligado só depois do gesto inicial: antes disso não há o que controlar. */
  ativo: boolean
}

/**
 * Liga o controle remoto e devolve o status pro pontinho do HUD.
 *
 * `publicar` é chamado na troca de cena; fora isso o receptor republica
 * sozinho a cada 2 s.
 */
export function useRemoto(opcoes: OpcoesUseRemoto): {
  status: StatusRemoto
  publicar: () => void
} {
  const [status, setStatus] = useState<StatusRemoto>('desligado')
  // Em refs: o receptor é montado UMA vez e não pode ser derrubado só porque o
  // Player renderizou de novo.
  const refLer = useRef(opcoes.lerEstado)
  const refComando = useRef(opcoes.aoComando)
  refLer.current = opcoes.lerEstado
  refComando.current = opcoes.aoComando
  const refPublicar = useRef<() => void>(() => {})

  const { turma, codigo, ativo } = opcoes

  useEffect(() => {
    if (!ativo) return
    const receptor = criarReceptor({
      turma,
      codigo,
      aoCmd: digitarRemoto,
      aoComando: (texto) => refComando.current(texto),
      lerEstado: () => refLer.current(),
      aoStatus: setStatus,
    })
    refPublicar.current = receptor.publicar
    return () => {
      refPublicar.current = () => {}
      receptor.parar()
    }
  }, [turma, codigo, ativo])

  return { status, publicar: () => refPublicar.current() }
}
