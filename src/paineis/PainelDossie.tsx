import { useEffect, useRef, useState } from 'react'
import { especiePorChave } from '../mundo/bestiario'
import { imagemDoDossie } from '../formas/dossie'
import fichas from '../roteiros/fichas.json'

/**
 * Dossiê do contato não catalogado.
 *
 * É o `ficha` com outra postura. A ficha de catálogo é consulta tranquila; isto
 * é o que a IA conseguiu compilar de um bicho que ela não reconhece, com o
 * visor destruído e os sensores como única fonte. Daí a estética de arquivo:
 * carimbo piscando, silhueta se desenhando por traço, dados entrando linha a
 * linha em vez de aparecerem prontos.
 *
 * **Os dados são reais e as estimativas estão marcadas como estimativas.** Um
 * bicho extinto tem número incerto, e inventar precisão aqui seria ensinar a
 * coisa errada num painel que a plateia vai ler como fonte.
 */

type Ficha = {
  titulo: string
  dados: Record<string, string>
  /**
   * Crédito da imagem: autor, licença e fonte. Obrigatório quando existe
   * imagem — é condição das licenças CC e, mais do que isso, é o que a gente
   * está ensinando a fazer numa feira de ciências.
   */
  credito?: string
}
const FICHAS = fichas as Record<string, Ficha>

/** Quanto a silhueta leva pra se desenhar inteira. */
const MS_TRACO = 600
/**
 * Intervalo entre uma linha de dado e a seguinte.
 *
 * Calibrado contra o `tempos.json` da cena `dossie`: o painel abre aos ~6,4 s e
 * a fala vai até os 23 s, então cinco linhas a cada 2,8 s enchem o painel no
 * ritmo em que ela lê. Se o texto da cena mudar de tamanho, este é o número a
 * reconferir — ele é ritmo, não regra.
 */
const MS_ENTRE_LINHAS = 2800

type Props = {
  /** Chave da ficha e da silhueta. Sem ela, o painel diz que não tem nada. */
  argumento?: string
}

export function PainelDossie({ argumento }: Props) {
  const nome = argumento ?? ''
  const ficha = FICHAS[nome]
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const [linhasVisiveis, setLinhasVisiveis] = useState(0)

  const total = ficha ? Object.keys(ficha.dados).length : 0

  // Os dados entram um a um, no ritmo da fala da IA. Sincronizado por tempo e
  // não por linha de legenda de propósito: o painel é aberto por ação e não
  // sabe em que linha da cena está.
  useEffect(() => {
    if (total === 0) return
    const timers = Array.from({ length: total }, (_, i) =>
      window.setTimeout(() => setLinhasVisiveis(i + 1), MS_TRACO + i * MS_ENTRE_LINHAS),
    )
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [total, nome])

  useEffect(() => {
    const canvas = refCanvas.current
    const especie = especiePorChave(nome)
    if (!canvas || !especie) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let L = 0
    let A = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      L = Math.max(1, Math.round(caixa.width))
      A = Math.max(1, Math.round(caixa.height))
      canvas.width = L
      canvas.height = A
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    const nascimento = performance.now()
    let quadro = 0

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const avanco = Math.min(1, (agora - nascimento) / MS_TRACO)
      // Relógio vivo: a silhueta NADA, com a mesma batida de 0,4 Hz da câmera.
      // Um desenho parado num painel que diz "reconstrução dos sensores" lê
      // como foto de arquivo; nadando, lê como o bicho que está lá fora.
      const relogio = (agora - nascimento) / 1000
      ctx.clearRect(0, 0, L, A)

      // O bicho é desenhado pela MESMA função do bestiário que a câmera usa, e
      // não pelo amostrador de silhuetas do orbe. O amostrador devolve uns
      // quatrocentos pontos de contorno, e ligá-los por reta a este tamanho
      // transformava o tubarão num amontoado — ele existe pra virar partícula,
      // não pra virar traço.
      //
      // O limite vertical é A/1.35 e não A/2: a dorsal do megalodonte sobe a
      // 0,62 do comprimento, então o que define a caixa é a altura da barbatana,
      // não a do corpo.
      const comp = Math.min(L * 0.94, A / 0.82)
      const alt = comp * especie.proporcao
      const pose = { t: relogio, fase: 0.4, luz: 1, farol: 0, alpha: 1, silhueta: true }

      // Revelação da esquerda pra direita, como plotter: é o que faz o desenho
      // "acontecer" em vez de aparecer pronto.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, L * avanco, A)
      ctx.clip()

      // 1) a silhueta um pouco maior — vira o CONTORNO depois de vazar o miolo
      ctx.save()
      ctx.translate(L / 2, A / 2)
      ctx.scale(1.035, 1.035)
      especie.desenhar({ ctx, comp, alt, ...pose })
      ctx.restore()

      // 2) tudo que foi desenhado vira âmbar de uma vez
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = 'rgba(255, 194, 77, 0.95)'
      ctx.fillRect(0, 0, L, A)

      // 3) a mesma silhueta em tamanho normal APAGA o miolo, deixando o anel.
      //    O alpha parcial é o que segura um resto de preenchimento: dossiê é
      //    desenho técnico, e desenho técnico tem corpo, não só linha.
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 0.78
      ctx.save()
      ctx.translate(L / 2, A / 2)
      especie.desenhar({ ctx, comp, alt, ...pose })
      ctx.restore()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.restore()

      // A ponta do traço: uma linha vertical brilhante onde o desenho está
      // sendo feito agora. Some quando o desenho fecha, e aí o que continua é
      // só a natação.
      if (avanco < 1) {
        const x = L * avanco
        const g = ctx.createLinearGradient(x - 14, 0, x, 0)
        g.addColorStop(0, 'rgba(255, 194, 77, 0)')
        g.addColorStop(1, 'rgba(255, 220, 150, 0.85)')
        ctx.fillStyle = g
        ctx.fillRect(x - 14, 0, 14, A)
      }
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      if (quadro) cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [nome])

  if (!ficha) {
    return <p className="painel__vazio">sem dossiê para "{nome || '—'}".</p>
  }

  const imagem = imagemDoDossie(nome)

  return (
    <div className={imagem ? 'dossie dossie--com-imagem' : 'dossie'}>
      <div className="dossie__visual">
        {imagem && (
          <figure className="dossie__foto">
            <img src={imagem} alt="" />
            <figcaption className="dossie__rotulo-foto">reconstrução dos sensores</figcaption>
          </figure>
        )}
        <div className="dossie__silhueta">
          <canvas ref={refCanvas} className="dossie__canvas" />
          <span className="dossie__carimbo">estimativa dos sensores</span>
        </div>
      </div>
      <div className="dossie__dados">
        <h3 className="dossie__titulo">{ficha.titulo}</h3>
        <dl className="dossie__lista">
          {Object.entries(ficha.dados).map(([rotulo, valor], i) => (
            <div
              className={i < linhasVisiveis ? 'dossie__item dossie__item--visivel' : 'dossie__item'}
              key={rotulo}
            >
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
        {imagem && ficha.credito && <p className="dossie__credito">{ficha.credito}</p>}
      </div>
    </div>
  )
}
