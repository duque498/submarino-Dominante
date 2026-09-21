import { useEffect, useRef } from 'react'
import { especiePorChave } from '../mundo/bestiario'
import type { CenaCombate } from '../roteiros/tipos'

/**
 * Combate acústico: a plateia opera o sonar auxiliar.
 *
 * A IA está cega — o visor rachou e as câmeras caíram. Só o sonar sobrou, e
 * ele não diz direção sozinho. Quem diz é a tripulação: o 3A construiu um
 * sonar de papelão, a plateia lê o setor nele e grita; o operador aperta a
 * tecla e a IA dispara o pulso naquela direção.
 *
 * Por que o bicho nunca aparece: é o ponto da cena. A plateia vê um blip e
 * ouve um número. Mostrar o megalodonte desenhado resolveria a tensão e
 * roubaria o trabalho do sonar de papelão, que é o objeto que eles fizeram.
 *
 * TUDO o que é específico do 3A está no JSON — a criatura, os setores, as
 * rodadas e as falas. Este componente não sabe o que é um megalodonte.
 */

export type FaseCombate =
  | 'anunciando'
  | 'esperando'
  | 'acerto'
  | 'erro'
  /** Entre rodadas: a silhueta cruza a estática dos feeds. */
  | 'passagem'
  /** Depois do último acerto: a trilha corta e o silêncio pesa. */
  | 'fakeout'
  | 'fim'

export type EstadoCombate = {
  rodada: number
  fase: FaseCombate
  /** Índice do setor onde o contato está nesta rodada. */
  setor: number
  /** Setor que o operador marcou, ou null. */
  marcado: number | null
  /** 0 a 1. */
  casco: number
  contato: number
  /** performance.now() de quando a espera começou, pro timer. */
  desde: number
  /**
   * Quantos terços da imagem acústica já foram revelados.
   *
   * Cada acerto compra um pedaço da silhueta no centro do mostrador: o sonar
   * não "vê", ele acumula retornos. É a recompensa por acertar — e é ela que
   * transforma três perguntas iguais numa sequência com progressão.
   */
  revelado: number
}

type Props = {
  cena: CenaCombate
  estado: EstadoCombate
  aoResponder: (setor: number) => void
}

/** Velocidade do som na água, em m/s — a mesma do painel `eco`. */
const VELOCIDADE_SOM = 1500

/** Distância do contato nesta rodada, já descontado o recuo dos acertos. */
function distanciaAtual(cena: CenaCombate, estado: EstadoCombate): number {
  const base = cena.rodadas[estado.rodada]?.distancia ?? 0
  if (estado.fase === 'acerto') return base * 2.4
  if (estado.fase === 'erro') return Math.max(20, base * 0.15)
  return base
}

/**
 * Pontos da imagem acústica: a silhueta da criatura amostrada em pontos.
 *
 * Gerada uma vez, na primeira chamada, rasterizando o desenho do bestiário num
 * canvas pequeno e sorteando pixels cheios. Pontos, e não o traço, porque é
 * assim que um retorno de sonar se acumula — e porque um desenho nítido no
 * mostrador diria que a IA está vendo, que é justamente o que ela não está.
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
      if (dados[(y * LADO + x) * 4 + 3] > 40) {
        pontos.push([x / LADO - 0.5, y / LADO - 0.5])
      }
    }
  }
  // Embaralha: revelar um terço na ordem de varredura daria uma faixa
  // horizontal, e o que se quer é a figura aparecendo por inteiro, mais densa
  // a cada acerto.
  for (let i = pontos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pontos[i], pontos[j]] = [pontos[j], pontos[i]]
  }
  cacheImagem = { chave, pontos }
  return pontos
}

function tempoDeEco(metros: number): string {
  return ((2 * metros) / VELOCIDADE_SOM).toFixed(2).replace('.', ',')
}

export function Combate({ cena, estado, aoResponder }: Props) {
  const rodada = cena.rodadas[estado.rodada]
  const especie = especiePorChave(cena.criatura)
  const distancia = distanciaAtual(cena, estado)
  const respondido = estado.fase === 'acerto' || estado.fase === 'erro'

  return (
    <div className="painel combate" data-fase={estado.fase}>
      <div className="painel__moldura">
        <header className="painel__cabecalho">
          <span className="painel__nome">sonar auxiliar · direção do contato</span>
          <span className="painel__fechar">
            {estado.fase === 'fakeout'
              ? '—'
              : respondido
                ? 'seta direita pra seguir'
                : `tripulação: informem o setor · 1 a ${cena.setores.length}`}
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
            <dl className="combate__leitura">
              <div>
                <dt>Distância</dt>
                <dd>{Math.round(distancia)} M</dd>
              </div>
              <div>
                <dt>Tempo de eco</dt>
                <dd>{tempoDeEco(distancia)} S</dd>
              </div>
              <div>
                <dt>Massa estimada</dt>
                <dd>{especie ? especie.rotulo : '—'}</dd>
              </div>
            </dl>
            <p className="combate__rodadas">
              rodada {estado.rodada + 1} de {cena.rodadas.length}
            </p>
          </aside>

          <Mostrador
            cena={cena}
            estado={estado}
            distancia={distancia}
            tempoRodada={rodada?.tempo ?? 0}
          />

          {estado.fase === 'fakeout' && (
            <p className="combate__silencio">sinal perdido</p>
          )}

          <ul className="combate__setores">
            {cena.setores.map((nome, i) => (
              <li key={nome}>
                <button
                  type="button"
                  className={classeSetor(i, estado)}
                  onClick={() => estado.fase === 'esperando' && aoResponder(i)}
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
  if (estado.fase === 'acerto' || estado.fase === 'erro') {
    if (i === estado.setor) classes.push('combate__setor--certo')
    else if (i === estado.marcado) classes.push('combate__setor--errado')
    else classes.push('combate__setor--apagado')
  }
  return classes.join(' ')
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

/**
 * O mostrador: varredura dividida em setores, com o contato pulsando num deles.
 *
 * Canvas com rAF próprio e zero estado do React — a varredura gira a 60 fps e
 * um render por quadro custaria a árvore inteira. O que o React manda pra cá
 * (fase, rodada, setor) vive numa ref lida dentro do laço.
 */
function Mostrador({
  cena,
  estado,
  distancia,
  tempoRodada,
}: {
  cena: CenaCombate
  estado: EstadoCombate
  distancia: number
  tempoRodada: number
}) {
  const refCanvas = useRef<HTMLCanvasElement>(null)
  const refDados = useRef({ cena, estado, distancia, tempoRodada })
  refDados.current = { cena, estado, distancia, tempoRodada }

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

    const desenhar = (agora: number) => {
      quadro = requestAnimationFrame(desenhar)
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      const { cena: c, estado: e, distancia: d, tempoRodada: tr } = refDados.current

      // A varredura acelera com a ameaça: 1,3 rad/s na primeira rodada, quase
      // o dobro na última. É o mostrador ficando nervoso junto com a cena.
      const pressa = 1 + (e.rodada / Math.max(1, c.rodadas.length - 1)) * 0.9
      angulo = (angulo + dt * 1.3 * pressa) % (Math.PI * 2)

      const cx = lado / 2
      const raio = lado * 0.44
      ctx.clearRect(0, 0, lado, lado)

      const setores = c.setores.length
      const abertura = (Math.PI * 2) / setores
      // Setor 0 centrado em cima (a proa aponta pra frente na tela).
      const inicioDe = (i: number) => -Math.PI / 2 - abertura / 2 + i * abertura

      // fatias
      for (let i = 0; i < setores; i++) {
        const marcado = e.fase !== 'esperando' && i === e.setor
        ctx.beginPath()
        ctx.moveTo(cx, cx)
        ctx.arc(cx, cx, raio, inicioDe(i), inicioDe(i) + abertura)
        ctx.closePath()
        ctx.fillStyle = marcado
          ? e.fase === 'acerto'
            ? 'rgba(77, 255, 166, 0.14)'
            : 'rgba(255, 110, 90, 0.16)'
          : 'rgba(10, 34, 42, 0.5)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(56, 232, 255, 0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Anéis de distância. Os rótulos descem pelo eixo vertical de baixo: com
      // três setores essa é exatamente a divisa entre dois deles, então o
      // número não cai em cima de nenhum rótulo de setor.
      const maxAlcance = Math.max(200, (c.rodadas[0]?.distancia ?? 900) * 1.25)
      ctx.strokeStyle = 'rgba(56, 232, 255, 0.16)'
      ctx.lineWidth = 1
      for (let k = 1; k <= 3; k++) {
        const r = (raio * k) / 3
        ctx.beginPath()
        ctx.arc(cx, cx, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.font = `${Math.max(8, lado * 0.024)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      for (let k = 1; k <= 3; k++) {
        const r = (raio * k) / 3
        const texto = `${Math.round((maxAlcance * k) / 3)} m`
        // Tarja curta atrás: o número precisa se ler por cima do rastro verde.
        const larg = ctx.measureText(texto).width + 8
        ctx.fillStyle = 'rgba(4, 16, 20, 0.85)'
        ctx.fillRect(cx - larg / 2, cx + r - lado * 0.028, larg, lado * 0.036)
        ctx.fillStyle = 'rgba(56, 232, 255, 0.55)'
        ctx.fillText(texto, cx, cx + r)
      }
      ctx.textAlign = 'left'

      // rastro e linha da varredura
      const rastro = ctx.createConicGradient?.(angulo - 0.9, cx, cx)
      if (rastro) {
        rastro.addColorStop(0, 'rgba(77, 255, 166, 0)')
        rastro.addColorStop(0.22, 'rgba(77, 255, 166, 0.2)')
        rastro.addColorStop(0.25, 'rgba(77, 255, 166, 0)')
        ctx.fillStyle = rastro
        ctx.beginPath()
        ctx.arc(cx, cx, raio, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.beginPath()
      ctx.moveTo(cx, cx)
      ctx.lineTo(cx + Math.cos(angulo) * raio, cx + Math.sin(angulo) * raio)
      ctx.strokeStyle = 'rgba(77, 255, 166, 0.85)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Números enormes dos setores, DENTRO da fatia. Em 0,66 do raio eles
      // cabem inteiros no círculo — em 0,78 o nome do setor saía pela borda do
      // canvas nas fatias laterais.
      for (let i = 0; i < setores; i++) {
        const meio = inicioDe(i) + abertura / 2
        const rx = cx + Math.cos(meio) * raio * 0.66
        const ry = cx + Math.sin(meio) * raio * 0.66
        const marcado = e.fase !== 'esperando' && i === e.setor
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `bold ${lado * 0.13}px ui-monospace, monospace`
        ctx.fillStyle = marcado ? 'rgba(56, 232, 255, 0.42)' : 'rgba(56, 232, 255, 0.22)'
        ctx.fillText(String(i + 1), rx, ry - lado * 0.018)
        ctx.font = `${Math.max(8, lado * 0.024)}px ui-monospace, monospace`
        ctx.fillStyle = 'rgba(189, 255, 240, 0.45)'
        ctx.fillText(c.setores[i], rx, ry + lado * 0.068)
        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = 'left'
      }

      // A imagem acústica acumulada, no centro do mostrador. Entra ANTES do
      // blip: é fundo de leitura, não objeto em movimento.
      if (e.revelado > 0) {
        const pontos = imagemAcustica(c.criatura)
        const completa = e.revelado >= c.rodadas.length
        // Pulso único quando a imagem fecha: 900 ms a partir do último acerto.
        const idadePulso = completa ? Math.min(1, (agora - e.desde) / 900) : 1
        const pulso = completa ? 1 + (1 - idadePulso) * 0.35 : 1
        const brilho = completa ? 0.55 + (1 - idadePulso) * 0.45 : 0.4
        const escala = raio * 1.02 * pulso
        const quantos = Math.floor((pontos.length * e.revelado) / c.rodadas.length)

        // Disco escuro atrás: os pontos são verdes sobre um rastro de varredura
        // que também é verde, e sem separar os dois a figura some no fundo.
        const fundo = ctx.createRadialGradient(cx, cx, 0, cx, cx, raio * 0.78)
        fundo.addColorStop(0, `rgba(2, 14, 12, ${0.72 * brilho})`)
        fundo.addColorStop(1, 'rgba(2, 14, 12, 0)')
        ctx.fillStyle = fundo
        ctx.beginPath()
        ctx.arc(cx, cx, raio * 0.78, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `rgba(124, 255, 196, ${brilho})`
        const tam = Math.max(1.4, lado * 0.0075 * pulso)
        for (let i = 0; i < quantos; i++) {
          const [px, py] = pontos[i]
          ctx.fillRect(cx + px * escala, cx + py * escala, tam, tam)
        }
        if (completa) {
          ctx.strokeStyle = `rgba(77, 255, 166, ${(1 - idadePulso) * 0.5})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(cx, cx, raio * (0.4 + idadePulso * 0.7), 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // O contato. Blip grande com rastro — nada parecido com os de cenário.
      const fracao = Math.min(1, d / maxAlcance)
      const meio = inicioDe(e.setor) + abertura / 2
      const bx = cx + Math.cos(meio) * raio * fracao
      const by = cx + Math.sin(meio) * raio * fracao
      const pulso = (Math.sin(agora / 180) + 1) / 2
      const cor = e.fase === 'acerto' ? '77, 255, 166' : '255, 110, 90'

      // Fake-out: ele volta pela BORDA, do outro lado, e some. Sem rastro e
      // sem rótulo — é um retorno solto, não um contato confirmado.
      if (e.fase === 'fakeout') {
        const idade = Math.min(1, (agora - e.desde) / 3600)
        if (idade > 0.5 && idade < 0.95) {
          const f = (idade - 0.5) / 0.45
          const vis = Math.sin(f * Math.PI)
          const ang = inicioDe(e.setor) + abertura / 2 + Math.PI
          const bx2 = cx + Math.cos(ang) * raio * 0.94
          const by2 = cx + Math.sin(ang) * raio * 0.94
          ctx.beginPath()
          ctx.arc(bx2, by2, lado * 0.02, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255, 110, 90, ${vis * 0.9})`
          ctx.fill()
        }
      }

      if (e.fase !== 'fim' && e.fase !== 'fakeout' && e.fase !== 'passagem') {
        // rastro: onde ele estava
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(meio) * raio * Math.min(1, fracao + 0.12), cy0(cx, meio, raio, fracao + 0.12))
        ctx.lineTo(bx, by)
        ctx.strokeStyle = `rgba(${cor}, 0.25)`
        ctx.lineWidth = lado * 0.02
        ctx.lineCap = 'round'
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(bx, by, lado * 0.022 + pulso * lado * 0.012, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${cor}, ${0.7 + pulso * 0.3})`
        ctx.fill()
        ctx.beginPath()
        ctx.arc(bx, by, lado * 0.05 + pulso * lado * 0.025, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${cor}, ${0.45 - pulso * 0.25})`
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Tarja atrás da leitura: ela cai onde o contato estiver, e sem fundo
        // ficava ilegível por cima do rótulo do setor ou do rastro da varredura.
        ctx.textAlign = 'center'
        ctx.font = `${Math.max(9, lado * 0.027)}px ui-monospace, monospace`
        const leitura = `ECO: ${tempoDeEco(d)} S · ${Math.round(d)} M`
        const largura = ctx.measureText(leitura).width + lado * 0.03
        const ly = by - lado * 0.075
        ctx.fillStyle = 'rgba(4, 16, 20, 0.88)'
        ctx.fillRect(bx - largura / 2, ly - lado * 0.026, largura, lado * 0.038)
        ctx.strokeStyle = `rgba(${cor}, 0.4)`
        ctx.lineWidth = 1
        ctx.strokeRect(bx - largura / 2, ly - lado * 0.026, largura, lado * 0.038)
        ctx.fillStyle = `rgba(${cor}, 0.95)`
        ctx.fillText(leitura, bx, ly)
        ctx.textAlign = 'left'
      }

      // Pulso acústico do acerto: anel saindo do centro na direção do setor.
      if (e.fase === 'acerto') {
        const idade = Math.min(1, (agora - e.desde) / 900)
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(cx, cx)
        ctx.arc(cx, cx, raio, inicioDe(e.setor), inicioDe(e.setor) + abertura)
        ctx.closePath()
        ctx.clip()
        for (let k = 0; k < 3; k++) {
          const r = raio * (idade * 1.25 - k * 0.14)
          if (r <= 0) continue
          ctx.beginPath()
          ctx.arc(cx, cx, r, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(150, 255, 210, ${(1 - idade) * (0.8 - k * 0.22)})`
          ctx.lineWidth = lado * 0.012
          ctx.stroke()
        }
        ctx.restore()
      }

      // Timer: o arco de tempo consumindo a borda do mostrador.
      if (e.fase === 'esperando' && tr > 0) {
        const resta = Math.max(0, 1 - (agora - e.desde) / (tr * 1000))
        ctx.beginPath()
        ctx.arc(cx, cx, raio + lado * 0.03, -Math.PI / 2, -Math.PI / 2 + resta * Math.PI * 2)
        ctx.strokeStyle = resta < 0.3 ? 'rgba(255, 110, 90, 0.95)' : 'rgba(255, 194, 77, 0.85)'
        ctx.lineWidth = lado * 0.016
        ctx.lineCap = 'butt'
        ctx.stroke()
      }
    }

    quadro = requestAnimationFrame(desenhar)
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

/** y de um ponto polar — extraído só pra a linha do rastro não ficar ilegível. */
function cy0(cx: number, angulo: number, raio: number, fracao: number): number {
  return cx + Math.sin(angulo) * raio * Math.min(1, fracao)
}
