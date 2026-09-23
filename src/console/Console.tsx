import { useEffect, useRef, useState } from 'react'
import { completar } from './comandos'

type Props = {
  aberto: boolean
  /** Trava o campo enquanto a IA "processa" o comando. */
  travado: boolean
  /** Texto que a própria IA digita sozinha (comando roteirizado do JSON). */
  autoTexto?: string | null
  /**
   * Texto já no campo quando o console abre, sem digitação e sem executar.
   *
   * É o atalho do operador: a tecla abre o console com o comando começado e
   * ele só completa o argumento. Diferente do `autoTexto`, que é a IA digitando
   * na frente da plateia e executando no fim.
   */
  textoInicial?: string | null
  aoFechar: () => void
  aoExecutar: (texto: string, manterAberto: boolean) => void
  /** Avisa que a digitação automática terminou, pra o Player limpar o pedido. */
  aoTerminarAuto?: () => void
}

/** Velocidade da digitação automática: humana, não instantânea. */
const MS_POR_CHAR_AUTO = 60
/** Uma hesitação no meio, pra não parecer macro. */
const MS_HESITACAO = 420

/**
 * Barra de comando. O que o operador digita fica visível pra plateia — isso é
 * parte do show, então a fonte é grande e o campo tem brilho.
 */
export function ConsoleComandos({
  aberto,
  travado,
  autoTexto,
  textoInicial,
  aoFechar,
  aoExecutar,
  aoTerminarAuto,
}: Props) {
  const [texto, setTexto] = useState('')
  const [historico, setHistorico] = useState<string[]>([])
  const [posHistorico, setPosHistorico] = useState(-1)
  const refInput = useRef<HTMLInputElement>(null)

  // Foco ao abrir; campo limpo ao fechar.
  useEffect(() => {
    if (aberto) {
      refInput.current?.focus()
      // O cursor vai pro fim: o operador continua digitando de onde o atalho
      // parou, sem ter que apertar End.
      if (textoInicial) {
        setTexto(textoInicial)
        window.setTimeout(() => {
          const campo = refInput.current
          if (campo) campo.setSelectionRange(textoInicial.length, textoInicial.length)
        }, 0)
      }
    } else {
      setTexto('')
      setPosHistorico(-1)
    }
    // `textoInicial` fora das dependências: ele só vale no instante em que o
    // console abre. Como dependência, redigitaria o comando por cima do que o
    // operador já escreveu a cada render do Player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  // Digitação automática de um comando roteirizado.
  useEffect(() => {
    if (!autoTexto) return
    setTexto('')
    let indice = 0
    // A hesitação cai mais ou menos no meio da frase.
    const pausaEm = Math.floor(autoTexto.length / 2)
    let timer: ReturnType<typeof setTimeout>

    const digitar = () => {
      indice++
      setTexto(autoTexto.slice(0, indice))
      if (indice >= autoTexto.length) {
        timer = setTimeout(() => {
          aoExecutar(autoTexto, false)
          aoTerminarAuto?.()
        }, 400)
        return
      }
      timer = setTimeout(digitar, indice === pausaEm ? MS_HESITACAO : MS_POR_CHAR_AUTO)
    }
    timer = setTimeout(digitar, 250)
    return () => clearTimeout(timer)
  }, [autoTexto, aoExecutar, aoTerminarAuto])

  if (!aberto) return null

  const sugestao = travado ? null : completar(texto)
  const fantasma = sugestao ? sugestao.slice(texto.length) : ''

  const aoTeclar = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    // O console captura tudo: nenhuma tecla de navegação vaza pro Player.
    evento.stopPropagation()

    if (evento.key === 'Escape') {
      evento.preventDefault()
      aoFechar()
      return
    }
    if (travado) {
      evento.preventDefault()
      return
    }
    if (evento.key === 'Tab') {
      evento.preventDefault()
      if (sugestao) setTexto(sugestao)
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      const comando = texto.trim()
      if (!comando) return
      setHistorico((anterior) => [comando, ...anterior].slice(0, 40))
      setPosHistorico(-1)
      setTexto('')
      aoExecutar(comando, evento.shiftKey)
      return
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (historico.length === 0) return
      const proxima = Math.min(posHistorico + 1, historico.length - 1)
      setPosHistorico(proxima)
      setTexto(historico[proxima])
      return
    }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      const proxima = posHistorico - 1
      setPosHistorico(proxima)
      setTexto(proxima < 0 ? '' : historico[proxima])
    }
  }

  return (
    <div className={travado ? 'console console--travado' : 'console'}>
      <span className="console__prompt">DOMI &gt;</span>
      <span className="console__campo">
        {/* O fantasma fica atrás do input, alinhado caractere a caractere. */}
        <span className="console__fantasma" aria-hidden="true">
          <span className="console__fantasma-digitado">{texto}</span>
          {fantasma}
        </span>
        <input
          ref={refInput}
          className="console__input"
          value={texto}
          readOnly={travado}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          onBlur={() => refInput.current?.focus()}
        />
      </span>
      {!travado && <span className="console__cursor" />}
    </div>
  )
}
