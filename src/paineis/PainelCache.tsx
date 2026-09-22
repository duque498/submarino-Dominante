import { useEffect, useRef } from 'react'
import { imagemDaEspecie } from '../mundo/sprites'
import { quadroSeguro } from '../ui/falhas'

/**
 * Cache de espécies: o contador que a expedição de identificação recalibra.
 *
 * O banco corrompeu na descida e está em zero. Cada espécie identificada
 * devolve um pedaço, e é esse número subindo que transforma "acertei" em
 * "consertei alguma coisa". Por isso o contador é um ODÔMETRO e não um número
 * que troca: a rolagem dos dígitos dura, e a plateia acompanha a subida em vez
 * de ver o resultado já pronto.
 */

export type EstadoCache = {
  /** Pra onde o contador está indo. Ele persegue; a rolagem é a viagem. */
  alvo: number
  total: number
  /** Ids das espécies já identificadas, na ordem. */
  identificadas: string[]
  /** Quantos slots a grade mostra (uma por espécie da cena). */
  slots: number
  /** Zero e piscando: o banco caiu e ainda ninguém consertou. */
  corrompido: boolean
}

/** Quanto o contador leva pra alcançar o alvo. Rápido o bastante pra não cansar. */
const MS_ROLAGEM = 1400

export function PainelCache({ estado }: { estado: EstadoCache }) {
  const refNumero = useRef<HTMLSpanElement>(null)
  const refBarra = useRef<HTMLSpanElement>(null)
  const refEstado = useRef(estado)
  refEstado.current = estado
  /** Valor desenhado. Fora do React: ele muda a cada quadro. */
  const refValor = useRef(0)

  useEffect(() => {
    let quadro = 0
    let anterior = performance.now()
    const passo = quadroSeguro('cache de espécies', (agora: number) => {
      quadro = requestAnimationFrame(passo)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const { alvo, total } = refEstado.current
      const resta = alvo - refValor.current
      if (Math.abs(resta) > 0.5) {
        // Velocidade proporcional ao que falta: os dígitos correm e vão
        // parando, como odômetro de verdade.
        const passoValor = Math.max(total / (MS_ROLAGEM / 16), Math.abs(resta) * dt * 4)
        refValor.current += Math.sign(resta) * Math.min(Math.abs(resta), passoValor)
      } else {
        refValor.current = alvo
      }
      const v = Math.round(refValor.current)
      if (refNumero.current) {
        refNumero.current.textContent = v.toLocaleString('pt-BR')
      }
      if (refBarra.current) {
        refBarra.current.style.width = `${Math.min(100, (v / total) * 100)}%`
      }
    })
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [])

  return (
    <div className={`cache${estado.corrompido ? ' cache--corrompido' : ''}`}>
      <div className="cache__leitura">
        {/* Sem filho no JSX: os dígitos vêm do laço, não do React. */}
        <span className="cache__numero" ref={refNumero} />
        <span className="cache__total">/ {estado.total.toLocaleString('pt-BR')}</span>
      </div>
      <span className="cache__trilho">
        <span className="cache__nivel" ref={refBarra} />
      </span>
      {estado.corrompido && <p className="cache__alerta">corrompido</p>}
      <ul className="cache__grade">
        {Array.from({ length: estado.slots }, (_, i) => {
          const id = estado.identificadas[i]
          return (
            <li key={i} className={`cache__slot${id ? ' cache__slot--cheio' : ''}`}>
              {id ? <Miniatura chave={id} /> : <span className="cache__vazio">—</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * A silhueta pequena da espécie no slot.
 *
 * Desenhada num canvas e não num `<img>` porque o PNG é preto: num painel
 * escuro ele sumiria. Aqui ele é recolorido pelo próprio alfa — o slot mostra
 * a FORMA, que é o que prova que aquela espécie entrou no banco.
 */
function Miniatura({ chave }: { chave: string }) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let quadro = 0
    const tentar = () => {
      const img = imagemDaEspecie(chave)
      const caixa = canvas.getBoundingClientRect()
      const L = Math.max(1, Math.round(caixa.width))
      const A = Math.max(1, Math.round(caixa.height))
      if (canvas.width !== L || canvas.height !== A) {
        canvas.width = L
        canvas.height = A
      }
      if (!img) {
        // O PNG ainda está decodificando: tenta de novo no quadro seguinte.
        quadro = requestAnimationFrame(tentar)
        return
      }
      const escala = Math.min(L / img.naturalWidth, A / img.naturalHeight) * 0.92
      const w = img.naturalWidth * escala
      const h = img.naturalHeight * escala
      ctx.clearRect(0, 0, L, A)
      ctx.drawImage(img, (L - w) / 2, (A - h) / 2, w, h)
      // Recolore pelo alfa: o preto do arquivo vira o ciano do HUD.
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = 'rgba(56, 232, 255, 0.85)'
      ctx.fillRect(0, 0, L, A)
      ctx.globalCompositeOperation = 'source-over'
    }
    quadro = requestAnimationFrame(tentar)
    return () => cancelAnimationFrame(quadro)
  }, [chave])
  return <canvas className="cache__miniatura" ref={refCanvas} aria-hidden="true" />
}
