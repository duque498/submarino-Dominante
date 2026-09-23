import { useEffect, useRef } from 'react'
import {
  atualizarRuido,
  criarRastro,
  desenharSonar,
  semearRuido,
  type ContatoSonar,
  type EstadoSonar,
  type RuidoSonar,
} from './sonar'
import { quadroSeguro } from '../ui/falhas'
import { imagemDaEspecie } from '../mundo/sprites'

/** Anéis do mostrador do console. Mesma régua do combate. */
const ANEIS = [150, 300, 450, 600, 900]
/** Metros na borda. */
const ALCANCE = 954
/** Velocidade da varredura, em rad/s. Uma volta leva ~4,8 s. */
const VELOCIDADE = 1.3
/** Topo do mostrador: no canvas o y cresce pra baixo, então 12h é -π/2. */
const TOPO = -Math.PI / 2

/**
 * Nome da forma citada na fala -> rótulo de contato no mostrador.
 *
 * O sonar não diz "baleia": diz o que um instrumento diria. É o mesmo
 * vocabulário do retículo das câmeras, de propósito — os dois mostradores
 * falando a mesma língua fazem o submarino parecer um sistema só.
 */
const ROTULO_CONTATO: Record<string, string> = {
  baleia: 'CETÁCEO',
  tartaruga: 'QUELÔNIO',
  peixe: 'CARDUME',
  'agua-viva': 'CNIDÁRIO',
  coral: 'ESTRUTURA RECIFAL',
  mergulhador: 'CORPO HUMANO',
  submarino: 'CASCO METÁLICO',
  onda: 'SUPERFÍCIE',
}

/** Quanto o sonar leva pra "achar" o contato que a fala citou. */
const MS_ATE_CONTATO = 1200
/** Quanto o contato pisca como perdido na despedida, antes de sumir. */
const MS_APAGAR_CONTATO = 380

type Props = {
  /**
   * Toca o ping. Uma vez por volta, quando a varredura passa pelo topo — que é
   * a referência que todo mundo reconhece num mostrador de sonar. Mais que isso
   * vira barulho: o painel pode ficar minutos aberto na frente da plateia.
   */
  aoPing?: () => void
  /**
   * Nome da forma citada na linha que abriu o sonar. Com ele, o mostrador
   * encontra um contato "de frente" em ~1,2 s, com o rótulo da espécie: é o
   * que liga o que ela diz ao que a plateia vê acontecer.
   */
  contato?: string
  /**
   * Aberto pela fala (por ação do roteiro ou por gatilho). Muda o
   * comportamento: a varredura começa no topo e o primeiro contato aparece de
   * frente em ~1,2 s. O `contato` só dá o NOME a ele, quando a linha citou um
   * bicho — sem nome, o contato aparece igual, só anônimo.
   */
  daFala?: boolean
  /**
   * O Diretor está encerrando o sonar.
   *
   * O painel ainda está na tela, e é aqui que ele se despede: um ping final e
   * o contato se apagando. Sumir com o contato junto com o painel joga fora a
   * única coisa que aquele mostrador tinha a dizer — a plateia acabou de ouvir
   * o nome do bicho e veria o ponto desaparecer sem fechamento.
   */
  despedindo?: boolean
  /**
   * Segundos de uma APROXIMAÇÃO: um contato enorme entra pela borda e vem até
   * o centro nesse tempo, com o ping acelerando e ficando mais grave.
   *
   * É o único modo em que o sonar conta uma história em vez de só varrer. Sem
   * ele, "contato de grande porte se aproximando" era uma frase sobre uma tela
   * onde nada mudava.
   */
  aproximacao?: number
  /** Toca o ping da aproximação, com altura própria (1 = normal, <1 = grave). */
  aoPingGrave?: (altura: number) => void
}

/**
 * Varredura de sonar do console. Puramente animada — nenhum dado real atrás.
 *
 * É o MESMO instrumento do combate (`desenharSonar`), sem as cunhas de setor:
 * fora do combate não há setor a marcar, então não há cunha acesa. A plateia
 * vê o mesmo mostrador na cena de biologia e no combate, que é o ponto — o
 * submarino tem um sonar, não dois parecidos.
 */
export function PainelSonar({
  aoPing,
  contato,
  daFala = false,
  despedindo = false,
  aproximacao,
  aoPingGrave,
}: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  // Numa ref pra não religar a animação quando o Player recria o callback.
  const refPing = useRef(aoPing)
  refPing.current = aoPing
  const refContato = useRef(contato)
  refContato.current = contato
  const refDespedindo = useRef(despedindo)
  refDespedindo.current = despedindo
  const refAproximacao = useRef(aproximacao)
  refAproximacao.current = aproximacao
  const refPingGrave = useRef(aoPingGrave)
  refPingGrave.current = aoPingGrave

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lado = 0
    const ajustar = () => {
      const caixa = canvas.getBoundingClientRect()
      lado = Math.max(1, Math.round(Math.min(caixa.width, caixa.height)))
      canvas.width = lado
      canvas.height = lado
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(canvas)

    let quadro = 0
    // Aberto por fala, a varredura começa EXATAMENTE no topo: assim o contato
    // que a IA citou aparece na direção "de frente", e não onde o ponteiro por
    // acaso tivesse parado. Sem contato, começa logo antes do topo pra o
    // primeiro ping sair junto com a abertura.
    let angulo = daFala ? TOPO : TOPO - 0.25
    const nascimento = performance.now()
    let anterior = nascimento
    // Aproximação: o próximo ping sai quando o relógio passa deste instante.
    let proximoPing = nascimento
    const ruido: RuidoSonar[] = semearRuido(nascimento, 11)
    const rastro = criarRastro()

    /** O contato nomeado, quando ele já apareceu. */
    let achado: {
      angulo: number
      distancia: number
      rotulo?: string
      especie?: string
    } | null = null
    let despediuEm = 0

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(passo)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const anguloAnterior = angulo
      angulo = (angulo + dt * VELOCIDADE) % (Math.PI * 2)
      // A volta zera o ângulo, então só conta cruzamento sem dar a volta.
      if (anguloAnterior < TOPO && angulo >= TOPO) refPing.current?.()
      atualizarRuido(ruido, agora)

      let alvo: ContatoSonar | null = null
      const segundos = refAproximacao.current

      if (segundos) {
        // --- aproximação: ele vem da borda até quase o centro ---------------
        const avanco = Math.min(1, (agora - nascimento) / (segundos * 1000))
        // Ping acelerando: de 1,1 s no começo a 0,17 s no fim. A curva é
        // quadrática porque linear não LÊ como aceleração — lê como metrônomo
        // ficando mais rápido.
        const intervalo = 1100 - 930 * avanco * avanco
        if (agora >= proximoPing) {
          proximoPing = agora + intervalo
          // E mais grave: o que se aproxima soa mais baixo.
          refPingGrave.current?.(1 - avanco * 0.55)
        }
        const distancia = ALCANCE * (1 - avanco * 0.86)
        alvo = {
          setor: -1,
          distancia,
          desvio: Math.sin(agora / 900) * 0.5 + Math.sin(agora / 430 + 1.3) * 0.3,
          // Metros por segundo do avanço, pra o vetor ter o tamanho certo.
          velocidade: (ALCANCE * 0.86) / segundos,
          estado: 'ativo',
        }
      } else {
        // --- contato nomeado: aparece de frente, no tempo certo -------------
        if (!achado && daFala && agora - nascimento >= MS_ATE_CONTATO) {
          achado = {
            angulo: (Math.random() - 0.5) * 0.5,
            distancia: ALCANCE * (0.42 + Math.random() * 0.2),
            rotulo: refContato.current
              ? (ROTULO_CONTATO[refContato.current] ?? refContato.current.toUpperCase())
              : undefined,
            // Tendo PNG registrado, o contato nomeado aparece com a silhueta
            // do bicho; senão continua blip. A IA diz CETÁCEO e o mostrador
            // mostra um cetáceo — é a mesma baleia da identificação.
            especie: refContato.current,
          }
          if (refContato.current) imagemDaEspecie(refContato.current)
          refPing.current?.()
        }
        // Despedida: ping final, o contato pisca como perdido e some. Só
        // depois disso o painel sai.
        if (refDespedindo.current && !despediuEm) {
          despediuEm = agora
          refPing.current?.()
        }
        const apagado = despediuEm > 0 && agora - despediuEm > MS_APAGAR_CONTATO
        if (achado && !apagado) {
          alvo = {
            setor: -1,
            distancia: achado.distancia,
            desvio: achado.angulo,
            velocidade: 0,
            estado: despediuEm > 0 ? 'perdido' : 'ativo',
            rotulo: achado.rotulo,
            especie: achado.especie,
          }
        }
      }

      const estado: EstadoSonar = {
        // Sem setores: fora do combate não há direção a marcar, e cunhas
        // acesas aqui seriam enfeite sem função.
        setores: [],
        setorAceso: null,
        alcance: ALCANCE,
        aneis: ANEIS,
        angulo,
        pulso: null,
        contato: alvo,
      }
      desenharSonar(ctx, lado, estado, ruido, agora, rastro)
    }

    const passo = quadroSeguro('sonar do console', desenhar)
    quadro = requestAnimationFrame(passo)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [daFala])

  return (
    <div className="painel__sonar">
      <canvas ref={refCanvas} className="painel__sonar-canvas" />
      <p className="painel__legenda">sonar ativo · 360°</p>
    </div>
  )
}
