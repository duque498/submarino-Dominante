import { useEffect, useRef } from 'react'
import type { SomHidrofone } from '../roteiros/tipos'
import { quadroSeguro } from '../ui/falhas'

/**
 * Hidrofone: a plateia identifica o som.
 *
 * A tela inteira é um instrumento de escuta, e o espectrograma é o centro
 * dela porque ele mostra o que o ouvido já ouviu — a chuva vira uma faixa
 * larga e agitada no agudo, o navio vira listras grossas e REGULARES no
 * grave, a baleia vira riscos que sobem. Quem não reconheceu pelo som
 * reconhece pelo desenho, e quem reconheceu pelo som vê o porquê.
 *
 * Congela na revelação em vez de limpar: a imagem do som que acabou de tocar
 * é a prova, e apagá-la no instante do acerto jogaria fora a única coisa que
 * liga o que a sala ouviu ao nome que ela gritou.
 */

export type FaseHidro = 'escutando' | 'revelado' | 'fim'

export type EstadoHidro = {
  fase: FaseHidro
  /** Índice do som atual. */
  indice: number
  /** A pista já foi dita? */
  pista: boolean
  /** A tripulação acertou, ou o operador revelou? */
  acertou: boolean
}

type Props = {
  som: SomHidrofone
  estado: EstadoHidro
  total: number
  /** Espectro vivo do hidrofone. Função, não valor: muda a cada quadro. */
  lerEspectro: () => Uint8Array | null
  lerOnda: () => Uint8Array | null
}

/**
 * Nyquist assumido pro eixo de frequência.
 *
 * O `AudioContext` da máquina pode abrir em 44,1 ou 48 kHz, e a diferença
 * desloca o eixo em meio por cento — invisível num espectrograma cenográfico.
 * Ler a taxa real exigiria expor o contexto só pra isso.
 */
const TAXA_NYQUIST = 24_000
const LARGURA = 660
const ALTURA = 232
/** Quantos pixels o espectrograma anda por quadro. */
const PASSO = 2
/**
 * Faixa desenhada, em Hz, e em escala LOGARÍTMICA.
 *
 * Linear não servia: o canto da baleia vive entre 180 e 2000 Hz e ficava
 * espremido nos 15% de baixo do quadro, enquanto três quartos da tela eram
 * silêncio. Em log, a baleia ganha metade da altura pra desenhar o glissando
 * subindo — que é justamente o traço que identifica o som.
 */
const HZ_MIN = 30
const HZ_MAX = 12_000
/** Velocidade do som na água do mar, em m/s. */
const VELOCIDADE_SOM = 1500
/** Quanto a viagem do som leva NA TELA, independente da distância real. */
const MS_VIAGEM = 1800

const ROTULO_ORIGEM: Record<SomHidrofone['origem'], string> = {
  superficie: 'superfície',
  navio: 'mecânica',
  animal: 'biológica',
}

/** Tempo real de trânsito, escrito como a plateia entende. */
function transito(distanciaKm: number): string {
  const segundos = (distanciaKm * 1000) / VELOCIDADE_SOM
  if (segundos < 60) return `${segundos.toFixed(1).replace('.', ',')} s`
  const minutos = Math.floor(segundos / 60)
  return `${minutos} min ${Math.round(segundos - minutos * 60)} s`
}

/**
 * Que faixa do analisador cai em cada linha de pixel.
 *
 * Calculado UMA vez por canvas: um `Math.pow` por pixel por quadro seriam
 * 14 mil por segundo só pra montar uma coluna que não muda de mapeamento.
 * Grave embaixo, agudo em cima — é como todo mundo lê um espectro.
 */
function mapaDeFaixas(bins: number, altura: number, nyquist: number): Int32Array {
  const mapa = new Int32Array(altura)
  const razao = Math.log(HZ_MAX / HZ_MIN)
  for (let y = 0; y < altura; y++) {
    const hz = HZ_MIN * Math.exp(((altura - 1 - y) / (altura - 1)) * razao)
    mapa[y] = Math.min(bins - 1, Math.max(0, Math.round((hz / nyquist) * bins)))
  }
  return mapa
}

/** Cor por intensidade: fundo → ciano → branco. */
function pintar(dados: Uint8Array, dentro: Uint8ClampedArray, mapa: Int32Array) {
  for (let y = 0; y < mapa.length; y++) {
    const v = dados[mapa[y]] / 255
    const i = y * 4
    dentro[i] = 20 + v * v * 235
    dentro[i + 1] = 30 + v * 200
    dentro[i + 2] = 40 + v * 215
    dentro[i + 3] = 255
  }
}

function Espectrograma({ estado, lerEspectro }: Pick<Props, 'estado' | 'lerEspectro'>) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refCongelado = useRef(false)
  refCongelado.current = estado.fase !== 'escutando'

  // Um canvas por SOM: trocar de som zera a imagem, e o `key` no pai garante
  // que o efeito rode de novo em vez de continuar a rolagem do som anterior.
  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#03141a'
    ctx.fillRect(0, 0, LARGURA, ALTURA)

    // Uma tira de 1 px, reaproveitada: alocar um ImageData por quadro seria
    // lixo pro coletor 60 vezes por segundo.
    const tira = ctx.createImageData(1, ALTURA)
    let mapa: Int32Array | null = null
    let quadro = 0

    const desenhar = () => {
      if (!refCongelado.current) {
        // Rolagem: o próprio canvas é desenhado deslocado sobre si mesmo. Um
        // buffer separado custaria uma cópia inteira por quadro.
        ctx.drawImage(canvas, -PASSO, 0)
        const dados = lerEspectro()
        if (dados) {
          // O mapa depende do número de faixas, que só existe depois de o
          // analisador nascer — e ele nasce com o primeiro som.
          mapa ??= mapaDeFaixas(dados.length, ALTURA, TAXA_NYQUIST)
          pintar(dados, tira.data, mapa)
          // O espectro não muda dentro de dois pixels de tempo: a mesma tira
          // vale pras PASSO colunas novas.
          for (let x = 0; x < PASSO; x++) ctx.putImageData(tira, LARGURA - PASSO + x, 0)
        } else {
          ctx.fillStyle = '#03141a'
          ctx.fillRect(LARGURA - PASSO, 0, PASSO, ALTURA)
        }
      }
      quadro = requestAnimationFrame(protegido)
    }

    const protegido = quadroSeguro('espectrograma', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => cancelAnimationFrame(quadro)
  }, [lerEspectro])

  return (
    <canvas
      className="hidro__espectro"
      ref={refCanvas}
      width={LARGURA}
      height={ALTURA}
      aria-hidden="true"
    />
  )
}

function Onda({ estado, lerOnda }: Pick<Props, 'estado' | 'lerOnda'>) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refCongelado = useRef(false)
  refCongelado.current = estado.fase !== 'escutando'

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let quadro = 0
    const desenhar = () => {
      if (!refCongelado.current) {
        const dados = lerOnda()
        ctx.clearRect(0, 0, LARGURA, 54)
        ctx.strokeStyle = '#38e8ff'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        if (dados) {
          for (let x = 0; x < LARGURA; x++) {
            const v = dados[Math.floor((x / LARGURA) * dados.length)] / 128 - 1
            const y = 27 + v * 24
            if (x === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
        } else {
          ctx.moveTo(0, 27)
          ctx.lineTo(LARGURA, 27)
        }
        ctx.stroke()
      }
      quadro = requestAnimationFrame(protegido)
    }
    const protegido = quadroSeguro('onda do hidrofone', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => cancelAnimationFrame(quadro)
  }, [lerOnda])

  return (
    <canvas className="hidro__onda" ref={refCanvas} width={LARGURA} height={54} aria-hidden="true" />
  )
}

/**
 * O mapa da fonte.
 *
 * Não é o mapa da costa: é um esquema de distância, e o que ele conta é o
 * trânsito. A linha sai da fonte e chega no casco, e ao lado está quanto tempo
 * isso levaria de verdade a 1500 m/s — a chuva a segundos de distância e o
 * canto da baleia a minutos é a diferença que justifica a cena inteira.
 */
function MapaDoSom({ som }: { som: SomHidrofone }) {
  const refCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const L = 300
    const A = 116
    const inicio = performance.now()

    let quadro = 0
    const desenhar = () => {
      const t = ((performance.now() - inicio) % MS_VIAGEM) / MS_VIAGEM
      ctx.clearRect(0, 0, L, A)

      ctx.strokeStyle = 'rgba(27,106,120,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(24, A / 2)
      ctx.lineTo(L - 24, A / 2)
      ctx.stroke()

      // a fonte, à esquerda
      ctx.fillStyle = '#ffc24d'
      ctx.beginPath()
      ctx.arc(24, A / 2, 5, 0, Math.PI * 2)
      ctx.fill()

      // a frente de onda indo até o casco
      const x = 24 + t * (L - 48)
      ctx.strokeStyle = `rgba(56,232,255,${(1 - t * 0.7).toFixed(3)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(24, A / 2)
      ctx.lineTo(x, A / 2)
      ctx.stroke()
      for (const atraso of [0, 26, 52]) {
        const raio = x - 24 - atraso
        if (raio <= 0) continue
        ctx.beginPath()
        ctx.arc(24, A / 2, raio, -0.55, 0.55)
        ctx.stroke()
      }

      // o casco, à direita
      ctx.fillStyle = '#4dffa6'
      ctx.beginPath()
      ctx.ellipse(L - 24, A / 2, 9, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(L - 26, A / 2 - 10, 4, 6)

      quadro = requestAnimationFrame(protegido)
    }
    const protegido = quadroSeguro('mapa do hidrofone', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => cancelAnimationFrame(quadro)
  }, [som.id])

  return (
    <div className="hidro__mapa">
      <canvas ref={refCanvas} width={300} height={116} aria-hidden="true" />
      <dl className="hidro__dados">
        <div>
          <dt>distância</dt>
          <dd>{som.distanciaKm.toLocaleString('pt-BR')} km</dd>
        </div>
        <div>
          <dt>trânsito</dt>
          <dd>{transito(som.distanciaKm)}</dd>
        </div>
        <div>
          <dt>origem</dt>
          <dd>{ROTULO_ORIGEM[som.origem]}</dd>
        </div>
      </dl>
    </div>
  )
}

export function Hidrofone({ som, estado, total, lerEspectro, lerOnda }: Props) {
  const revelado = estado.fase !== 'escutando'

  return (
    <div className="hidro" data-fase={estado.fase}>
      <header className="hidro__cabecalho">
        <span className="hidro__contagem">
          sinal {estado.indice + 1} de {total}
        </span>
        <span className="hidro__dica">
          {revelado ? 'fonte localizada' : 'enter confirma · x revela'}
        </span>
      </header>

      <Espectrograma key={som.id} estado={estado} lerEspectro={lerEspectro} />
      <Onda estado={estado} lerOnda={lerOnda} />

      {!revelado && estado.pista && <p className="hidro__pista">{som.pista}</p>}

      {revelado && (
        <div className="hidro__fonte">
          <div className="hidro__identificacao">
            <h3 className="hidro__nome">{som.nome}</h3>
            {!estado.acertou && (
              <p className="hidro__sem-acerto">sem confirmação da tripulação</p>
            )}
            <p className="hidro__pista-dita">{som.pista}</p>
          </div>
          <MapaDoSom som={som} />
        </div>
      )}
    </div>
  )
}
