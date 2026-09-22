import { useEffect, useRef } from 'react'
import { especiePorChave } from '../mundo/bestiario'
import type { CenaCombate } from '../roteiros/tipos'
import {
  atualizarRuido,
  desenharSonar,
  semearRuido,
  tempoDeEco,
  type EstadoSonar,
  type RuidoSonar,
} from '../paineis/sonar'
import { quadroSeguro } from '../ui/falhas'

/**
 * Combate acústico: a plateia opera o sonar auxiliar.
 *
 * A IA está cega — o visor rachou e as câmeras caíram. Só o sonar sobrou, e
 * ele não diz direção sozinho. Quem diz é a tripulação: o 3A construiu um
 * sonar de papelão, a plateia lê o setor nele e grita; o operador aperta a
 * tecla e a IA dispara o pulso naquela direção.
 *
 * **O contato AVANÇA.** Não há pergunta com cronômetro: há um bicho vindo, e o
 * relógio é ele. Isso muda o que a plateia faz — em vez de esperar o timer
 * acabar, ela olha o mostrador e decide. O tempo continua existindo, mas
 * agora ele tem forma.
 *
 * Por que o bicho nunca aparece desenhado aqui: é o ponto da cena. A plateia vê
 * um blip e ouve um número. Mostrar o megalodonte resolveria a tensão e
 * roubaria o trabalho do sonar de papelão, que é o objeto que eles fizeram.
 *
 * TUDO o que é específico do 3A está no JSON — a criatura, os setores, as
 * rodadas e as falas. Este componente não sabe o que é um megalodonte.
 */

export type FaseCombate =
  /** O contato está vindo. É a fase em que a tecla vale. */
  | 'investida'
  /** Acertou: ele foi empurrado pra fora e o sonar fica vazio um instante. */
  | 'perdido'
  /** Chegou ao centro: apagão, casco. */
  | 'impacto'
  /** Depois do último acerto: a trilha corta e o silêncio pesa. */
  | 'fakeout'
  | 'fim'

/**
 * A parte do combate que muda a 60 fps.
 *
 * Fica numa ref, fora do estado do React: a distância do contato muda a cada
 * quadro, e como estado seria um render do Player inteiro por quadro. O
 * componente lê por função, igual à coluna d'água do mergulho.
 */
export type SimulacaoCombate = {
  /** Metros até o casco. */
  distancia: number
  /** Metros por segundo, já com a aceleração dos erros. */
  velocidade: number
  /** Desvio lateral dentro da cunha, -1 a 1: o zigue-zague. */
  desvio: number
  /** performance.now() em que o pulso volta a estar pronto. */
  prontoEm: number
  /** Último instante em que uma tecla foi recusada, pro feedback seco. */
  recusaEm: number
  /** Pulso acústico no ar: setor e quando saiu. */
  pulso: { setor: number; em: number } | null
}

export type EstadoCombate = {
  fase: FaseCombate
  /** Quantas investidas já foram VENCIDAS. Também é o índice da rodada. */
  acertos: number
  setor: number
  /** 0 a 1. */
  casco: number
  contato: number
  /**
   * Quantos terços da imagem acústica já foram revelados.
   *
   * Cada acerto compra um pedaço da silhueta no centro do mostrador: o sonar
   * não "vê", ele acumula retornos. É a recompensa por acertar — e é ela que
   * transforma três investidas iguais numa sequência com progressão.
   */
  revelado: number
  /** performance.now() da entrada nesta fase. */
  desde: number
}

type Props = {
  cena: CenaCombate
  estado: EstadoCombate
  /** Lê a simulação viva. Função, não valor: ela muda a cada quadro. */
  lerSim: () => SimulacaoCombate
  aoResponder: (setor: number) => void
}

/** Alcance do mostrador, em metros. É a distância da primeira investida. */
function alcanceDe(cena: CenaCombate): number {
  return Math.max(...cena.rodadas.map((r) => r.distancia)) * 1.06
}

/** Anéis rotulados. Os do roteiro mais os intermediários que couberem. */
function aneisDe(cena: CenaCombate): number[] {
  const alcance = alcanceDe(cena)
  const base = [150, 300, 450, 600, 900]
  return base.filter((m) => m <= alcance)
}

export function Combate({ cena, estado, lerSim, aoResponder }: Props) {
  const especie = especiePorChave(cena.criatura)
  const emInvestida = estado.fase === 'investida'

  return (
    <div className="painel combate" data-fase={estado.fase}>
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">sonar auxiliar · direção do contato</span>
          <span className="painel__fechar">
            {emInvestida
              ? `tripulação: informem o setor · 1 a ${cena.setores.length}`
              : estado.fase === 'perdido'
                ? 'contato fora de alcance'
                : estado.fase === 'fakeout'
                  ? '—'
                  : 'aguarde'}
          </span>
        </header>
        <div className="painel__corpo combate__corpo">
          <aside className="combate__barras">
            <Barra
              rotulo="Integridade do casco"
              valor={estado.casco}
              tom={estado.casco <= 0.34 ? 'critico' : estado.casco <= 0.67 ? 'alerta' : 'ok'}
            />
            <Barra rotulo="Contato" valor={estado.contato} tom="contato" />
            <Leitura estado={estado} lerSim={lerSim} especie={especie?.rotulo ?? '—'} />
            <Recarga lerSim={lerSim} />
            <p className="combate__rodadas">
              investida {Math.min(estado.acertos + 1, cena.rodadas.length)} de{' '}
              {cena.rodadas.length}
            </p>
          </aside>

          <Mostrador cena={cena} estado={estado} lerSim={lerSim} />

          <ul className="combate__setores">
            {cena.setores.map((nome, i) => (
              <li key={nome}>
                <button
                  type="button"
                  className={classeSetor(i, estado)}
                  onClick={() => emInvestida && aoResponder(i)}
                >
                  <span className="combate__tecla">{i + 1}</span>
                  <span className="combate__setor-nome">{nome}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function classeSetor(i: number, estado: EstadoCombate): string {
  const classes = ['combate__setor']
  if (estado.fase === 'perdido' && i === estado.setor) classes.push('combate__setor--certo')
  if (estado.fase === 'impacto' && i === estado.setor) classes.push('combate__setor--errado')
  return classes.join(' ')
}

/**
 * Distância e eco ao vivo.
 *
 * Escreve no DOM por `requestAnimationFrame` em vez de virar estado: os dois
 * números mudam a cada quadro, e um render por quadro custaria a árvore toda.
 */
function Leitura({
  estado,
  lerSim,
  especie,
}: {
  estado: EstadoCombate
  lerSim: () => SimulacaoCombate
  especie: string
}) {
  const refDist = useRef<HTMLElement>(null)
  const refEco = useRef<HTMLElement>(null)
  const refLer = useRef(lerSim)
  refLer.current = lerSim
  const ativo = estado.fase === 'investida'
  const refAtivo = useRef(ativo)
  refAtivo.current = ativo

  useEffect(() => {
    let quadro = 0
    const passo = quadroSeguro('leitura do combate', () => {
      quadro = requestAnimationFrame(passo)
      const sim = refLer.current()
      const m = Math.max(0, Math.round(sim.distancia))
      if (refDist.current) {
        refDist.current.textContent = refAtivo.current ? `${m} M` : '—'
      }
      if (refEco.current) {
        refEco.current.textContent = refAtivo.current
          ? `${tempoDeEco(m).toFixed(2).replace('.', ',')} S`
          : '—'
      }
    })
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [])

  return (
    <dl className="combate__leitura">
      <div>
        <dt>Distância</dt>
        {/* Sem filho no JSX: o texto vem do laço, não do React. */}
        <dd ref={refDist} />
      </div>
      <div>
        <dt>Tempo de eco</dt>
        <dd ref={refEco} />
      </div>
      <div>
        <dt>Massa estimada</dt>
        <dd>{especie}</dd>
      </div>
    </dl>
  )
}

/**
 * Barra de recarga do pulso.
 *
 * Ela existe por um motivo de regra, não de enfeite: sem cooldown, apertar
 * 1-2-3 em sequência acerta sempre e a cena vira apertar botão. Com 1,2 s
 * entre disparos, a plateia precisa DECIDIR — e a barra é o que torna a regra
 * visível em vez de uma tecla que misteriosamente não responde.
 */
function Recarga({ lerSim }: { lerSim: () => SimulacaoCombate }) {
  const refCaixa = useRef<HTMLDivElement>(null)
  const refNivel = useRef<HTMLSpanElement>(null)
  const refRotulo = useRef<HTMLSpanElement>(null)
  const refLer = useRef(lerSim)
  refLer.current = lerSim

  useEffect(() => {
    let quadro = 0
    const passo = quadroSeguro('recarga do pulso', () => {
      quadro = requestAnimationFrame(passo)
      const sim = refLer.current()
      const agora = performance.now()
      const resta = sim.prontoEm - agora
      const caixa = refCaixa.current
      const nivel = refNivel.current
      if (!caixa || !nivel) return
      const recarregando = resta > 0
      caixa.classList.toggle('combate__recarga--ativa', recarregando)
      nivel.style.width = recarregando
        ? `${Math.max(0, 100 - (resta / MS_COOLDOWN) * 100)}%`
        : '100%'
      if (refRotulo.current) {
        const texto = recarregando ? 'Recarregando pulso' : 'Pulso acústico pronto'
        if (refRotulo.current.textContent !== texto) refRotulo.current.textContent = texto
      }
      // Recusa: pisca vermelho por um instante quando a tecla foi ignorada.
      caixa.classList.toggle('combate__recarga--recusa', agora - sim.recusaEm < 220)
    })
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [])

  return (
    <div className="combate__recarga" ref={refCaixa}>
      {/* Sem filho no JSX: o texto alterna no laço, junto com a barra. */}
      <span className="combate__recarga-rotulo" ref={refRotulo} />
      <span className="combate__recarga-trilho">
        <span className="combate__recarga-nivel" ref={refNivel} />
      </span>
    </div>
  )
}

/** Cooldown do pulso, em ms. Repetido aqui e no Player: um número só, no tipo. */
export const MS_COOLDOWN = 1200

/**
 * Pontos da imagem acústica: a silhueta da criatura amostrada em pontos.
 *
 * Gerada uma vez, rasterizando o desenho do bestiário num canvas pequeno e
 * pegando os pixels cheios. Pontos, e não o traço, porque é assim que um
 * retorno de sonar se acumula — e porque um desenho nítido no mostrador diria
 * que a IA está vendo, que é justamente o que ela não está.
 */
let cacheImagem: { chave: string; pontos: Array<[number, number]> } | null = null

function imagemAcustica(chave: string): Array<[number, number]> {
  if (cacheImagem?.chave === chave) return cacheImagem.pontos
  const especie = especiePorChave(chave)
  if (!especie) return []
  const LADO = 128
  const cv = document.createElement('canvas')
  cv.width = LADO
  cv.height = LADO
  const c = cv.getContext('2d')
  if (!c) return []
  c.translate(LADO / 2, LADO / 2)
  const comp = LADO * 0.88
  especie.desenhar({
    ctx: c,
    comp,
    alt: comp * especie.proporcao,
    t: 0.8,
    fase: 0.4,
    luz: 1,
    farol: 0,
    alpha: 1,
    silhueta: true,
  })
  const dados = c.getImageData(0, 0, LADO, LADO).data
  const pontos: Array<[number, number]> = []
  for (let y = 0; y < LADO; y += 2) {
    for (let x = 0; x < LADO; x += 2) {
      if (dados[(y * LADO + x) * 4 + 3] > 40) pontos.push([x / LADO - 0.5, y / LADO - 0.5])
    }
  }
  // Embaralha: revelar um terço na ordem de varredura daria uma faixa
  // horizontal, e o que se quer é a figura inteira ficando mais densa.
  for (let i = pontos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pontos[i], pontos[j]] = [pontos[j], pontos[i]]
  }
  cacheImagem = { chave, pontos }
  return pontos
}

/** O mostrador. Mesmo instrumento do painel do console, com as cunhas acesas. */
function Mostrador({
  cena,
  estado,
  lerSim,
}: {
  cena: CenaCombate
  estado: EstadoCombate
  lerSim: () => SimulacaoCombate
}) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refDados = useRef({ cena, estado, lerSim })
  refDados.current = { cena, estado, lerSim }

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

    let angulo = -Math.PI / 2
    let anterior = performance.now()
    let quadro = 0
    const ruido: RuidoSonar[] = semearRuido(anterior, 10)

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(protegido)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const { cena: c, estado: e, lerSim: ler } = refDados.current
      const sim = ler()

      // A varredura acelera com a ameaça: quanto mais perto ele está, mais
      // nervoso fica o mostrador.
      const alcance = alcanceDe(c)
      const perto = e.fase === 'investida' ? 1 - Math.min(1, sim.distancia / alcance) : 0
      angulo = (angulo + dt * 1.3 * (1 + perto * 1.1)) % (Math.PI * 2)
      atualizarRuido(ruido, agora)

      const mostrandoContato = e.fase === 'investida' || e.fase === 'perdido'
      const sonar: EstadoSonar = {
        setores: c.setores,
        setorAceso: mostrandoContato ? e.setor : null,
        alcance,
        aneis: aneisDe(c),
        angulo,
        pulso: sim.pulso ? { setor: sim.pulso.setor, idade: agora - sim.pulso.em } : null,
        contato: mostrandoContato
          ? {
              setor: e.setor,
              distancia: sim.distancia,
              desvio: sim.desvio,
              velocidade: sim.velocidade,
              estado: e.fase === 'perdido' ? 'perdido' : 'ativo',
            }
          : null,
      }
      desenharSonar(ctx, lado, sonar, ruido, agora)

      // A imagem acústica acumulada, por cima do mostrador.
      if (e.revelado > 0) {
        const pontos = imagemAcustica(c.criatura)
        const completa = e.revelado >= c.rodadas.length
        const idadePulso = completa ? Math.min(1, (agora - e.desde) / 900) : 1
        const pulsa = completa ? 1 + (1 - idadePulso) * 0.3 : 1
        const brilho = completa ? 0.5 + (1 - idadePulso) * 0.45 : 0.34
        const cx = lado / 2
        const raio = lado * 0.42

        const fundo = ctx.createRadialGradient(cx, cx, 0, cx, cx, raio * 0.72)
        fundo.addColorStop(0, `rgba(2, 14, 12, ${0.68 * brilho})`)
        fundo.addColorStop(1, 'rgba(2, 14, 12, 0)')
        ctx.fillStyle = fundo
        ctx.beginPath()
        ctx.arc(cx, cx, raio * 0.72, 0, Math.PI * 2)
        ctx.fill()

        const escala = raio * 0.95 * pulsa
        const quantos = Math.floor((pontos.length * e.revelado) / c.rodadas.length)
        ctx.fillStyle = `rgba(124, 255, 196, ${brilho})`
        const tam = Math.max(1.3, lado * 0.007 * pulsa)
        for (let i = 0; i < quantos; i++) {
          ctx.fillRect(cx + pontos[i][0] * escala, cx + pontos[i][1] * escala, tam, tam)
        }
        if (completa && idadePulso < 1) {
          ctx.strokeStyle = `rgba(124, 255, 196, ${(1 - idadePulso) * 0.5})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(cx, cx, raio * (0.35 + idadePulso * 0.7), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    const protegido = quadroSeguro('mostrador do combate', desenhar)
    quadro = requestAnimationFrame(protegido)
    return () => {
      cancelAnimationFrame(quadro)
      observador.disconnect()
    }
  }, [])

  return (
    <div className="combate__mostrador">
      <canvas ref={refCanvas} className="combate__canvas" />
    </div>
  )
}

function Barra({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string
  valor: number
  tom: 'ok' | 'alerta' | 'critico' | 'contato'
}) {
  return (
    <div className={`combate__barra combate__barra--${tom}`}>
      <span className="combate__barra-rotulo">{rotulo}</span>
      <span className="combate__barra-trilho">
        <span
          className="combate__barra-nivel"
          style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%` }}
        />
      </span>
      <span className="combate__barra-valor">{Math.round(valor * 100)}%</span>
    </div>
  )
}
