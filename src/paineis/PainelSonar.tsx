import { useEffect, useRef } from 'react'

const ANEIS = [200, 400, 600, 800]
const MAX_BLIPS = 7
/** Velocidade da varredura, em rad/s. Uma volta leva ~4,8 s. */
const VELOCIDADE = 1.3
/** Topo do mostrador: no canvas o y cresce pra baixo, então 12h é 3π/2. */
const TOPO = (Math.PI * 3) / 2

type Blip = {
  angulo: number
  distancia: number
  nascimento: number
  vida: number
  /** Contato nomeado: o que a IA acabou de citar na fala. */
  rotulo?: string
}

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
/** Quanto o contato leva pra se apagar na despedida. */
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
}

/** Varredura de sonar. Puramente animada — nenhum dado real por trás. */
export function PainelSonar({ aoPing, contato, daFala = false, despedindo = false }: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  // Numa ref pra não religar a animação quando o Player recria o callback.
  const refPing = useRef(aoPing)
  refPing.current = aoPing
  const refContato = useRef(contato)
  refContato.current = contato
  const refDespedindo = useRef(despedindo)
  refDespedindo.current = despedindo

  useEffect(() => {
    const canvas = refCanvas.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const blips: Blip[] = []
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
    let contatoMarcado = false
    let despediu = false
    let anterior = nascimento

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const anguloAnterior = angulo
      angulo = (angulo + dt * VELOCIDADE) % (Math.PI * 2)
      // A volta zera o ângulo, então só conta cruzamento sem dar a volta.
      if (anguloAnterior < TOPO && angulo >= TOPO) refPing.current?.()

      const c = lado / 2
      const raio = c * 0.92
      ctx.clearRect(0, 0, lado, lado)

      // anéis de distância
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.28)'
      ctx.lineWidth = 1
      ctx.font = `${Math.max(8, lado * 0.032)}px ui-monospace, monospace`
      ctx.fillStyle = 'rgba(56, 232, 255, 0.5)'
      ANEIS.forEach((metros, i) => {
        const r = (raio * (i + 1)) / ANEIS.length
        ctx.beginPath()
        ctx.arc(c, c, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillText(`${metros} m`, c + 4, c - r + 12)
      })

      // cruz central
      ctx.beginPath()
      ctx.moveTo(c - raio, c)
      ctx.lineTo(c + raio, c)
      ctx.moveTo(c, c - raio)
      ctx.lineTo(c, c + raio)
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.16)'
      ctx.stroke()

      // rastro da varredura
      const rastro = ctx.createConicGradient?.(angulo - 0.9, c, c)
      if (rastro) {
        rastro.addColorStop(0, 'rgba(77, 255, 166, 0)')
        rastro.addColorStop(0.22, 'rgba(77, 255, 166, 0.22)')
        rastro.addColorStop(0.25, 'rgba(77, 255, 166, 0)')
        ctx.fillStyle = rastro
        ctx.beginPath()
        ctx.arc(c, c, raio, 0, Math.PI * 2)
        ctx.fill()
      }

      // linha da varredura
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.lineTo(c + Math.cos(angulo) * raio, c + Math.sin(angulo) * raio)
      ctx.strokeStyle = 'rgba(77, 255, 166, 0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // O contato nomeado: aparece de frente, no tempo certo, com o ping.
      if (!contatoMarcado && daFala && agora - nascimento >= MS_ATE_CONTATO) {
        contatoMarcado = true
        blips.push({
          angulo: TOPO + (Math.random() - 0.5) * 0.16,
          distancia: 0.42 + Math.random() * 0.16,
          nascimento: agora,
          vida: 9000,
          rotulo: refContato.current
            ? (ROTULO_CONTATO[refContato.current] ?? refContato.current.toUpperCase())
            : undefined,
        })
        refPing.current?.()
      }

      // Despedida: ping final e o contato nomeado se apaga. Os de cenário
      // param de nascer — o mostrador se aquieta antes de sair.
      if (refDespedindo.current && !despediu) {
        despediu = true
        refPing.current?.()
        for (const blip of blips) {
          if (!blip.rotulo) continue
          blip.nascimento = agora - blip.vida + MS_APAGAR_CONTATO
        }
      }

      // contatos de cenário: nascem sob a varredura e desbotam
      if (!despediu && blips.length < MAX_BLIPS && Math.random() < 0.02) {
        blips.push({
          angulo: angulo + (Math.random() - 0.5) * 0.2,
          distancia: 0.2 + Math.random() * 0.75,
          nascimento: agora,
          vida: 2500 + Math.random() * 3500,
        })
      }
      for (let i = blips.length - 1; i >= 0; i--) {
        const blip = blips[i]
        const idade = (agora - blip.nascimento) / blip.vida
        if (idade >= 1) {
          blips.splice(i, 1)
          continue
        }
        const bx = c + Math.cos(blip.angulo) * raio * blip.distancia
        const by = c + Math.sin(blip.angulo) * raio * blip.distancia
        ctx.beginPath()
        ctx.arc(bx, by, (blip.rotulo ? 3.5 : 2.5) + (1 - idade) * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 194, 77, ${(1 - idade) * 0.9})`
        ctx.fill()
        if (blip.rotulo) {
          ctx.beginPath()
          ctx.arc(bx, by, 11 + (1 - idade) * 5, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255, 194, 77, ${(1 - idade) * 0.55})`
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.fillStyle = `rgba(255, 194, 77, ${Math.min(1, (1 - idade) * 1.4)})`
          ctx.fillText(`CONTATO: ${blip.rotulo}`, bx + 15, by + 4)
        }
      }
    }

    quadro = requestAnimationFrame(desenhar)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="painel__sonar">
      <canvas ref={refCanvas} className="painel__sonar-canvas" />
      <p className="painel__legenda">sonar ativo · 360°</p>
    </div>
  )
}
