/**
 * O mostrador de sonar, desenhado num lugar só.
 *
 * O painel do console e o combate do 3A usam o MESMO instrumento — o de fora
 * é o de dentro sem as cunhas acesas. Eram dois desenhos parecidos e não
 * iguais, e isso aparecia: a plateia via um radar na cena de biologia e outro
 * no combate, e o submarino deixava de parecer uma máquina só.
 *
 * O desenho é de INSTRUMENTO, não de radar de desenho animado. O que separa os
 * dois é sempre a mesma coisa: escala legível (anéis rotulados em metros),
 * referência de direção (azimute a cada 30°, proa no topo), decaimento em vez
 * de linha dura, e ruído de fundo. Um mostrador limpo demais parece enfeite;
 * um instrumento de verdade está sempre um pouco sujo.
 *
 * Função pura de desenho: recebe o estado e pinta. Quem simula é quem chama.
 */

/** Velocidade do som na água salgada. A mesma do painel `eco` e do combate. */
export const VELOCIDADE_SOM = 1500

export type ContatoSonar = {
  /** Índice do setor onde ele está. -1 = sem setor (painel fora do combate). */
  setor: number
  /** Metros até o centro. */
  distancia: number
  /**
   * Desvio lateral dentro da cunha, -1 a 1. É o zigue-zague: um contato que
   * desce em linha reta parece animação de menu, não um bicho manobrando.
   */
  desvio: number
  /** Metros por segundo. Só dimensiona o vetor de velocidade. */
  velocidade: number
  /** `perdido` pisca e some: foi atingido. */
  estado: 'ativo' | 'perdido'
  /**
   * Nome na etiqueta, no lugar de `CONTATO`.
   *
   * Fora do combate o mostrador sabe O QUE achou (`CETÁCEO`, `CARDUME`), e
   * dizer isso é o serviço do painel. No combate ele não sabe — e é por isso
   * que a plateia precisa existir.
   */
  rotulo?: string
}

export type EstadoSonar = {
  /** Rótulos dos setores. Vazio = mostrador sem cunhas. */
  setores: string[]
  /** Cunha acesa, ou null. Fora do combate é sempre null. */
  setorAceso: number | null
  /** Metros na borda do mostrador. */
  alcance: number
  /** Anéis rotulados, em metros. */
  aneis: number[]
  contato: ContatoSonar | null
  /** Ângulo da varredura, em radianos. */
  angulo: number
  /** Pulso acústico saindo: setor e idade em ms. */
  pulso: { setor: number; idade: number } | null
}

/** Topo do mostrador: no canvas o y cresce pra baixo, então 12h é -π/2. */
const TOPO = -Math.PI / 2
/** Rastro da varredura. 120° é o que dá decaimento sem virar disco cheio. */
const RASTRO = (Math.PI * 2) / 3

const CIANO = '56, 232, 255'
const VERDE = '77, 255, 166'
const AMBAR = '255, 194, 77'
const VERMELHO = '255, 110, 90'

export function tempoDeEco(metros: number): number {
  return (2 * metros) / VELOCIDADE_SOM
}

/** Ruído de fundo: blips fracos que nascem e somem sozinhos. */
export type RuidoSonar = { angulo: number; raio: number; nascimento: number; vida: number }

export function semearRuido(agora: number, quantos = 9): RuidoSonar[] {
  return Array.from({ length: quantos }, () => ({
    angulo: Math.random() * Math.PI * 2,
    raio: 0.15 + Math.random() * 0.8,
    nascimento: agora - Math.random() * 3000,
    vida: 1800 + Math.random() * 3200,
  }))
}

export function atualizarRuido(ruido: RuidoSonar[], agora: number) {
  for (const r of ruido) {
    if (agora - r.nascimento < r.vida) continue
    r.angulo = Math.random() * Math.PI * 2
    r.raio = 0.15 + Math.random() * 0.8
    r.nascimento = agora
    r.vida = 1800 + Math.random() * 3200
  }
}

/**
 * Desenha o mostrador inteiro. `lado` é o canvas quadrado.
 *
 * A ordem importa e é de fora pra dentro: cunhas, anéis, azimute, rastro,
 * ruído, contato, submarino. O contato vem depois do ruído de propósito — ele
 * é a informação, e informação não pode ficar embaixo de enfeite.
 */
export function desenharSonar(
  ctx: CanvasRenderingContext2D,
  lado: number,
  estado: EstadoSonar,
  ruido: RuidoSonar[],
  agora: number,
) {
  const c = lado / 2
  const raio = lado * 0.42
  ctx.clearRect(0, 0, lado, lado)

  const fonte = (f: number) => `${Math.max(8, lado * f)}px ui-monospace, monospace`
  const paraRaio = (metros: number) => (Math.min(metros, estado.alcance) / estado.alcance) * raio

  // --- 1) cunhas dos setores -----------------------------------------------
  const setores = estado.setores.length
  const abertura = setores > 0 ? (Math.PI * 2) / setores : 0
  const inicioDe = (i: number) => TOPO - abertura / 2 + i * abertura

  if (setores > 0) {
    for (let i = 0; i < setores; i++) {
      const aceso = estado.setorAceso === i
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.arc(c, c, raio, inicioDe(i), inicioDe(i) + abertura)
      ctx.closePath()
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.09)` : `rgba(${CIANO}, 0.025)`
      ctx.fill()
      ctx.strokeStyle = `rgba(${CIANO}, ${aceso ? 0.45 : 0.18})`
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }

  // --- 2) anéis de distância, finos e rotulados ----------------------------
  ctx.lineWidth = 1
  for (const metros of estado.aneis) {
    const r = paraRaio(metros)
    if (r <= 2) continue
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${CIANO}, 0.14)`
    ctx.stroke()
  }
  // Rótulos numa régua vertical descendo do centro: é a única direção livre
  // quando há três cunhas, porque ela cai exatamente sobre uma divisa.
  ctx.textAlign = 'center'
  ctx.font = fonte(0.021)
  const ultimoAnel = estado.aneis[estado.aneis.length - 1]
  for (const metros of estado.aneis) {
    const r = paraRaio(metros)
    if (r <= 2) continue
    // A unidade vai no último anel, e não numa legenda solta embaixo do
    // mostrador: lá ela caía exatamente em cima do rótulo de 180° do azimute.
    const texto = metros === ultimoAnel ? `${metros} M` : `${metros}`
    const larg = ctx.measureText(texto).width + lado * 0.018
    // Por DENTRO do anel: centrado nele, o rótulo do último anel encostava no
    // `180°` do azimute, que vem logo fora da borda.
    const base = c + r - lado * 0.014
    ctx.fillStyle = 'rgba(4, 16, 20, 0.82)'
    ctx.fillRect(c - larg / 2, base - lado * 0.018, larg, lado * 0.024)
    ctx.fillStyle = `rgba(${CIANO}, 0.55)`
    ctx.fillText(texto, c, base)
  }

  // --- 3) azimute a cada 30°, proa no topo ---------------------------------
  for (let g = 0; g < 360; g += 30) {
    const ang = TOPO + (g * Math.PI) / 180
    const cardeal = g % 90 === 0
    const r0 = raio * (cardeal ? 0.955 : 0.975)
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(ang) * r0, c + Math.sin(ang) * r0)
    ctx.lineTo(c + Math.cos(ang) * raio, c + Math.sin(ang) * raio)
    ctx.strokeStyle = `rgba(${CIANO}, ${cardeal ? 0.6 : 0.3})`
    ctx.lineWidth = cardeal ? 1.6 : 1
    ctx.stroke()
    if (g % 90 === 0) {
      const rt = raio * 1.075
      ctx.font = fonte(0.024)
      ctx.fillStyle = `rgba(${CIANO}, ${g === 0 ? 0.95 : 0.5})`
      ctx.textBaseline = 'middle'
      ctx.fillText(
        g === 0 ? 'N' : `${g}°`,
        c + Math.cos(ang) * rt,
        c + Math.sin(ang) * rt,
      )
      ctx.textBaseline = 'alphabetic'
    }
  }
  ctx.beginPath()
  ctx.arc(c, c, raio, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${CIANO}, 0.35)`
  ctx.lineWidth = 1.2
  ctx.stroke()

  // --- 4) varredura com afterglow ------------------------------------------
  // Gradiente cônico começando 120° ATRÁS da linha: o rastro decai de onde ela
  // passou até sumir, em vez de ser uma linha dura girando.
  const conico = ctx.createConicGradient?.(estado.angulo - RASTRO, c, c)
  if (conico) {
    conico.addColorStop(0, `rgba(${VERDE}, 0)`)
    conico.addColorStop(0.2, `rgba(${VERDE}, 0.05)`)
    conico.addColorStop(0.32, `rgba(${VERDE}, 0.16)`)
    conico.addColorStop(0.3333, `rgba(${VERDE}, 0.26)`)
    conico.addColorStop(0.3334, `rgba(${VERDE}, 0)`)
    ctx.fillStyle = conico
    ctx.beginPath()
    ctx.arc(c, c, raio, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(c, c)
  ctx.lineTo(c + Math.cos(estado.angulo) * raio, c + Math.sin(estado.angulo) * raio)
  ctx.strokeStyle = `rgba(${VERDE}, 0.75)`
  ctx.lineWidth = 1.4
  ctx.stroke()

  // --- 5) ruído de fundo ----------------------------------------------------
  for (const r of ruido) {
    const idade = (agora - r.nascimento) / r.vida
    if (idade < 0 || idade > 1) continue
    // Sino: nasce, brilha, some. Sem isso eles piscam em corte.
    const vis = Math.sin(idade * Math.PI) * 0.4
    ctx.beginPath()
    ctx.arc(c + Math.cos(r.angulo) * raio * r.raio, c + Math.sin(r.angulo) * raio * r.raio, lado * 0.005, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${VERDE}, ${vis})`
    ctx.fill()
  }

  // --- 6) números grandes dos setores, no arco externo ---------------------
  if (setores > 0) {
    for (let i = 0; i < setores; i++) {
      const meio = inicioDe(i) + abertura / 2
      const aceso = estado.setorAceso === i
      const rx = c + Math.cos(meio) * raio * 0.84
      const ry = c + Math.sin(meio) * raio * 0.84
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `bold ${lado * 0.105}px ui-monospace, monospace`
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.5)` : `rgba(${CIANO}, 0.22)`
      ctx.fillText(String(i + 1), rx, ry)
      ctx.font = fonte(0.022)
      ctx.fillStyle = aceso ? `rgba(${VERMELHO}, 0.7)` : `rgba(189, 255, 240, 0.4)`
      ctx.fillText(estado.setores[i], rx, ry + lado * 0.075)
      ctx.textBaseline = 'alphabetic'
    }
  }

  // --- 7) pulso acústico ----------------------------------------------------
  if (estado.pulso) {
    const f = Math.min(1, estado.pulso.idade / 900)
    ctx.save()
    if (setores > 0) {
      ctx.beginPath()
      ctx.moveTo(c, c)
      ctx.arc(c, c, raio, inicioDe(estado.pulso.setor), inicioDe(estado.pulso.setor) + abertura)
      ctx.closePath()
      ctx.clip()
    }
    for (let k = 0; k < 3; k++) {
      const r = raio * (f * 1.25 - k * 0.13)
      if (r <= 0) continue
      ctx.beginPath()
      ctx.arc(c, c, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(150, 255, 210, ${(1 - f) * (0.8 - k * 0.22)})`
      ctx.lineWidth = lado * 0.011
      ctx.stroke()
    }
    ctx.restore()
  }

  // --- 8) o contato ---------------------------------------------------------
  const alvo = estado.contato
  if (alvo) {
    const meio =
      alvo.setor >= 0 && setores > 0 ? inicioDe(alvo.setor) + abertura / 2 : TOPO
    // O desvio move o blip DENTRO da cunha: é o zigue-zague da aproximação.
    const ang = meio + alvo.desvio * abertura * 0.3
    const r = paraRaio(alvo.distancia)
    const bx = c + Math.cos(ang) * r
    const by = c + Math.sin(ang) * r
    const pulsa = (Math.sin(agora / 170) + 1) / 2
    const perdido = alvo.estado === 'perdido'
    // Perdido pisca em blocos: é sinal intermitente, não fade.
    const piscando = perdido ? (Math.floor(agora / 130) % 2 === 0 ? 1 : 0.15) : 1
    const cor = perdido ? CIANO : VERMELHO

    // halo pulsante
    ctx.beginPath()
    ctx.arc(bx, by, lado * (0.026 + pulsa * 0.018), 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${cor}, ${(0.5 - pulsa * 0.3) * piscando})`
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(bx, by, lado * 0.0135, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${cor}, ${(0.75 + pulsa * 0.25) * piscando})`
    ctx.fill()

    // vetor de velocidade: aponta pra onde ele VAI (o centro), e o tamanho diz
    // quão rápido. É o que transforma um ponto num objeto com intenção.
    if (!perdido && alvo.velocidade > 0) {
      const comp = Math.min(raio * 0.3, lado * 0.02 + alvo.velocidade * 0.0016 * lado)
      const vx = bx + Math.cos(ang + Math.PI) * comp
      const vy = by + Math.sin(ang + Math.PI) * comp
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.lineTo(vx, vy)
      ctx.strokeStyle = `rgba(${cor}, 0.7)`
      ctx.lineWidth = 1.6
      ctx.stroke()
      // ponta de seta
      const asa = lado * 0.012
      ctx.beginPath()
      ctx.moveTo(vx, vy)
      ctx.lineTo(vx - Math.cos(ang + Math.PI - 0.5) * asa, vy - Math.sin(ang + Math.PI - 0.5) * asa)
      ctx.moveTo(vx, vy)
      ctx.lineTo(vx - Math.cos(ang + Math.PI + 0.5) * asa, vy - Math.sin(ang + Math.PI + 0.5) * asa)
      ctx.stroke()
    }

    // etiqueta grudada no blip
    const texto = perdido
      ? 'SINAL PERDIDO'
      : `${alvo.rotulo ?? 'CONTATO'} · ${Math.round(alvo.distancia)} M · ECO ${tempoDeEco(alvo.distancia)
          .toFixed(2)
          .replace('.', ',')} s`
    ctx.font = fonte(0.024)
    ctx.textAlign = 'left'
    const larg = ctx.measureText(texto).width + lado * 0.024
    const alt = lado * 0.036
    // Sai pro lado de FORA do mostrador: apontada pro centro, a tarja cobria o
    // submarino, que é a única coisa que não pode sumir. Com o contato perto do
    // meio nenhum dos dois lados cabe — aí ela sobe (ou desce), que é o único
    // lugar onde ela não tapa nem a borda nem o centro.
    const folga = lado * 0.03
    const cabeNaDireita = bx + larg + folga <= lado
    const cabeNaEsquerda = bx - larg - folga >= 0
    const deLado = bx < c ? cabeNaEsquerda || cabeNaDireita : cabeNaDireita || cabeNaEsquerda
    const paraEsquerda = bx < c ? cabeNaEsquerda : !cabeNaDireita
    // Acima do blip quando ele está na metade de baixo, abaixo quando na de
    // cima: sempre pro lado de fora, nunca por cima da rota dele.
    const paraCima = by > c
    const ex = deLado
      ? paraEsquerda
        ? bx - larg - lado * 0.022
        : bx + lado * 0.022
      : Math.max(folga, Math.min(lado - larg - folga, bx - larg / 2))
    const ey = deLado
      ? by - alt / 2
      : paraCima
        ? by - lado * 0.05 - alt
        : by + lado * 0.05
    ctx.fillStyle = 'rgba(4, 16, 20, 0.88)'
    ctx.fillRect(ex, ey, larg, alt)
    ctx.strokeStyle = `rgba(${cor}, ${0.45 * piscando})`
    ctx.lineWidth = 1
    ctx.strokeRect(ex, ey, larg, alt)
    ctx.fillStyle = `rgba(${cor}, ${0.95 * piscando})`
    ctx.fillText(texto, ex + lado * 0.012, ey + alt * 0.7)
    // fio ligando a etiqueta ao blip
    ctx.beginPath()
    if (deLado) {
      ctx.moveTo(paraEsquerda ? ex + larg : ex, by)
    } else {
      ctx.moveTo(ex + larg / 2, paraCima ? ey + alt : ey)
    }
    ctx.lineTo(bx, by)
    ctx.strokeStyle = `rgba(${cor}, ${0.35 * piscando})`
    ctx.stroke()
    ctx.textAlign = 'center'
  }

  // --- 9) o submarino no centro, com o anel de alcance do pulso ------------
  ctx.beginPath()
  ctx.arc(c, c, lado * 0.052, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(${AMBAR}, 0.28)`
  ctx.setLineDash([3, 4])
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.setLineDash([])

  ctx.fillStyle = `rgba(${VERDE}, 0.95)`
  ctx.beginPath()
  ctx.ellipse(c, c, lado * 0.019, lado * 0.008, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(c - lado * 0.0035, c - lado * 0.021, lado * 0.007, lado * 0.014)
}
