import { useEffect, useRef } from 'react'
import { motor } from './motor'
import { MotorMundo, type Alvo, type OpcoesCamera } from './mundo'
import { zonaDe } from './perfil'
import { Rachadura } from './Rachadura'

type Props = {
  rotulo: string
  camera: OpcoesCamera
  /** Resolução interna do canvas. Baixa de propósito: é uma câmera. */
  largura?: number
  altura?: number
  /** Mini-feeds têm moldura; o fundo do palco não. */
  moldura?: boolean
  className?: string
  /**
   * Estado do visor. Com ele rachado ou parcial, entra a rachadura por cima —
   * inclusive por cima da estática, porque o vidro continua na frente da lente
   * mesmo quando não há imagem nenhuma.
   */
  visor?: 'ok' | 'rachado' | 'parcial'
  /** Semente da rachadura: cada câmera tem a sua, e sempre a mesma. */
  semente?: number
}

/**
 * Um feed de câmera externa. O canvas é registrado no motor, que desenha nele
 * dentro do próprio laço — o componente não tem requestAnimationFrame nenhum.
 */
export function Feed({
  rotulo,
  camera,
  largura = 256,
  altura = 144,
  moldura = true,
  className,
  visor = 'ok',
  semente = 1,
}: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refHora = useRef<HTMLSpanElement>(null)
  const refProfundidade = useRef<HTMLSpanElement>(null)
  const refReticulo = useRef<HTMLDivElement>(null)
  const refAlvoTexto = useRef<HTMLSpanElement>(null)
  const refPerdido = useRef<HTMLDivElement>(null)
  const refCamera = useRef(camera)
  refCamera.current = camera

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = largura
    canvas.height = altura

    // Cópia própria das opções: o motor escreve `estatica` aqui.
    const opcoes: OpcoesCamera = { ...refCamera.current }
    let proximaFalha = MotorMundo.agendarFalha(performance.now())
    let fimDaFalha = 0
    let ultimaHora = ''
    let ultimaProf = -1
    if (refProfundidade.current) refProfundidade.current.textContent = '—'
    if (refHora.current) refHora.current.textContent = '—'
    let alvoVisivel = false

    const aoDesenhar = ({ alvo, profundidade }: { alvo: Alvo | null; profundidade: number }) => {
      const agora = performance.now()

      // Na pane o motor derruba todos os feeds de uma vez; o rótulo acompanha.
      if (motor.estaticaGlobal) {
        refPerdido.current?.classList.add('feed__perdido--ativo')
      } else if (!fimDaFalha) {
        refPerdido.current?.classList.remove('feed__perdido--ativo')
      }

      // perda de sinal ocasional
      if (!fimDaFalha && agora > proximaFalha) {
        fimDaFalha = agora + MotorMundo.DURACAO_FALHA
        opcoes.estatica = true
        refPerdido.current?.classList.add('feed__perdido--ativo')
      } else if (fimDaFalha && agora > fimDaFalha) {
        fimDaFalha = 0
        opcoes.estatica = false
        proximaFalha = MotorMundo.agendarFalha(agora)
        refPerdido.current?.classList.remove('feed__perdido--ativo')
      }

      if (!moldura) return

      const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false })
      if (hora !== ultimaHora && refHora.current) {
        ultimaHora = hora
        refHora.current.textContent = hora
      }
      const metros = Math.round(profundidade)
      if (metros !== ultimaProf && refProfundidade.current) {
        ultimaProf = metros
        refProfundidade.current.textContent = `${metros} m · ${zonaDe(metros)}`
      }

      // retículo de rastreamento — o detalhe que vende a ideia de câmera
      const reticulo = refReticulo.current
      if (!reticulo) return
      if (alvo && !opcoes.estatica) {
        if (!alvoVisivel) {
          alvoVisivel = true
          reticulo.classList.add('feed__reticulo--ativo')
        }
        reticulo.style.left = `${alvo.x * 100}%`
        reticulo.style.top = `${alvo.y * 100}%`
        if (refAlvoTexto.current) {
          refAlvoTexto.current.textContent = `${alvo.rotulo} · ${alvo.distancia.toFixed(0)} m`
        }
      } else if (alvoVisivel) {
        alvoVisivel = false
        reticulo.classList.remove('feed__reticulo--ativo')
      }
    }

    const registro = { canvas, ctx, camera: opcoes, aoDesenhar }
    motor.registrar(registro)
    return () => motor.desregistrar(canvas)
  }, [largura, altura, moldura])

  if (!moldura) {
    return <canvas className={className ?? 'feed__canvas'} ref={refCanvas} aria-hidden="true" />
  }

  return (
    <div
      className={
        (className ? `feed ${className}` : 'feed') +
        (visor !== 'ok' ? ` feed--visor-${visor}` : '')
      }
      aria-hidden="true"
    >
      <canvas className="feed__canvas" ref={refCanvas} />
      {visor !== 'ok' && <Rachadura semente={semente} estado={visor} />}
      <div className="feed__reticulo" ref={refReticulo}>
        <span className="feed__alvo" ref={refAlvoTexto} />
      </div>
      <div className="feed__perdido" ref={refPerdido}>
        sinal fraco
      </div>
      {visor === 'rachado' && <div className="feed__comprometido">visor comprometido</div>}
      <div className="feed__cruz" />
      <div className="feed__barra feed__barra--topo">
        <span className="feed__rotulo">{rotulo}</span>
        <span className="feed__rec">● rec</span>
      </div>
      <div className="feed__barra feed__barra--base">
        {/* Sem filho: o texto vem do laço do motor, não do React. */}
        <span ref={refProfundidade} />
        <span ref={refHora} />
      </div>
    </div>
  )
}
