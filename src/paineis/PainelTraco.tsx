import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * "A IA interpreta o seu traço."
 *
 * O aluno desenha; o desenho vira a silhueta que o orbe assume. É a ideia de
 * Arte inteira em um gesto: a mesma coisa pode ser lida de outra forma.
 *
 * O canvas é a FONTE da amostragem, então ele é desenhado como uma silhueta
 * legível por src/formas/amostrar.ts: fundo claro, tinta escura, sem alpha
 * parcial. Nada aqui pode virar cinza médio, ou o corte por luminância fica
 * indeciso e o orbe assume um borrão.
 */

type Props = {
  /** Entrega o canvas do desenho pro Player amostrar. */
  aoInterpretar: (canvas: HTMLCanvasElement) => void
  aoFechar: () => void
  /** Trava os controles enquanto a IA "processa". */
  travado?: boolean
}

const FUNDO = '#e8f6ef'
const TINTA = '#04161a'
const ESPESSURA = 9
/** Janela da média móvel. 3 tira o tremor do trackpad sem atrasar o traço. */
const JANELA = 3

type Ponto = { x: number; y: number }

export function PainelTraco({ aoInterpretar, aoFechar, travado = false }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refDesenhando = useRef(false)
  const refBrutos = useRef<Ponto[]>([])
  const refAnterior = useRef<Ponto | null>(null)
  const [temTraco, setTemTraco] = useState(false)

  const limparTela = useCallback(() => {
    const canvas = refCanvas.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = FUNDO
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    refAnterior.current = null
    refBrutos.current = []
    setTemTraco(false)
  }, [])

  // Dimensiona o canvas pelo tamanho real na tela e pinta o fundo.
  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const medir = () => {
      const caixa = canvas.getBoundingClientRect()
      const largura = Math.max(1, Math.round(caixa.width))
      const altura = Math.max(1, Math.round(caixa.height))
      if (canvas.width === largura && canvas.height === altura) return
      canvas.width = largura
      canvas.height = altura
      limparTela()
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(canvas)
    return () => observador.disconnect()
  }, [limparTela])

  const media = (pontos: Ponto[]): Ponto => {
    let x = 0
    let y = 0
    for (const p of pontos) {
      x += p.x
      y += p.y
    }
    return { x: x / pontos.length, y: y / pontos.length }
  }

  const posicao = (evento: React.PointerEvent<HTMLCanvasElement>): Ponto => {
    const caixa = evento.currentTarget.getBoundingClientRect()
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top }
  }

  const aoDescer = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (travado) return
    // setPointerCapture: se o dedo ou o mouse sair do canvas no meio do traço,
    // os eventos continuam chegando aqui em vez de sumirem. Lança quando o
    // ponteiro já não está ativo, e uma exceção aqui derruba a tela inteira na
    // frente da plateia — o traço funciona sem a captura, só fica pior.
    try {
      evento.currentTarget.setPointerCapture(evento.pointerId)
    } catch {
      /* segue sem captura */
    }
    refDesenhando.current = true
    refBrutos.current = [posicao(evento)]
    refAnterior.current = media(refBrutos.current)
  }

  const aoMover = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (!refDesenhando.current || travado) return
    const ctx = refCanvas.current?.getContext('2d')
    if (!ctx) return

    refBrutos.current.push(posicao(evento))
    if (refBrutos.current.length > JANELA) refBrutos.current.shift()
    const suave = media(refBrutos.current)
    const anterior = refAnterior.current ?? suave

    ctx.strokeStyle = TINTA
    ctx.lineWidth = ESPESSURA
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(anterior.x, anterior.y)
    ctx.lineTo(suave.x, suave.y)
    ctx.stroke()

    refAnterior.current = suave
    if (!temTraco) setTemTraco(true)
  }

  const aoSubir = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    refDesenhando.current = false
    refAnterior.current = null
    refBrutos.current = []
    try {
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId)
      }
    } catch {
      /* nada a liberar */
    }
  }

  const interpretar = useCallback(() => {
    const canvas = refCanvas.current
    if (!canvas || travado || !temTraco) return
    aoInterpretar(canvas)
  }, [aoInterpretar, travado, temTraco])

  // Teclado próprio: o painel está registrado com capturaTeclado, então as
  // teclas de navegação do operador estão desligadas enquanto ele está aberto.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return
      if (evento.key === 'Enter') {
        evento.preventDefault()
        interpretar()
      } else if (evento.key === 'Backspace') {
        evento.preventDefault()
        if (!travado) limparTela()
      } else if (evento.key === 'Escape') {
        evento.preventDefault()
        aoFechar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [interpretar, limparTela, aoFechar, travado])

  return (
    <div className="traco">
      <canvas
        className="traco__tela"
        ref={refCanvas}
        onPointerDown={aoDescer}
        onPointerMove={aoMover}
        onPointerUp={aoSubir}
        onPointerCancel={aoSubir}
      />
      <div className="traco__rodape">
        <button
          className="traco__botao"
          type="button"
          onClick={interpretar}
          disabled={travado || !temTraco}
        >
          interpretar
        </button>
        <span className="traco__dica">
          {travado
            ? 'a IA está lendo o traço...'
            : temTraco
              ? 'enter interpreta · backspace limpa · esc fecha'
              : 'desenhe com o dedo ou o mouse'}
        </span>
      </div>
    </div>
  )
}
