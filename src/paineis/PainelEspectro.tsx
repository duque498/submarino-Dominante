import { useEffect, useState } from 'react'

/**
 * "As cores que o oceano apaga."
 *
 * A água absorve a luz por comprimento de onda: o vermelho morre nos primeiros
 * metros, o azul aguenta até bem fundo. Um peixe vermelho a 30 metros não está
 * cinza — ele está vermelho, só que não sobrou luz vermelha pra ele devolver.
 *
 * Os números são de ordem de grandeza, não de medição: água limpa de oceano
 * aberto. Água de costa, cheia de partícula, apaga tudo muito antes. Por isso
 * os rótulos dizem "cerca de" — fingir precisão aqui seria inventar dado.
 */

type Faixa = {
  nome: string
  cor: [number, number, number]
  /** Profundidade em que praticamente não sobra mais essa cor. */
  sumicoM: number
  rotulo: string
}

const FAIXAS: Faixa[] = [
  { nome: 'vermelho', cor: [232, 62, 58], sumicoM: 8, rotulo: 'cerca de 10 m' },
  { nome: 'laranja', cor: [240, 138, 46], sumicoM: 15, rotulo: 'cerca de 15 m' },
  { nome: 'amarelo', cor: [240, 214, 66], sumicoM: 30, rotulo: 'cerca de 30 m' },
  { nome: 'verde', cor: [96, 206, 104], sumicoM: 50, rotulo: 'cerca de 50 m' },
  { nome: 'ciano', cor: [72, 208, 224], sumicoM: 100, rotulo: 'cerca de 100 m' },
  { nome: 'violeta', cor: [152, 116, 226], sumicoM: 160, rotulo: 'cerca de 150 m' },
  { nome: 'azul', cor: [64, 122, 232], sumicoM: 200, rotulo: 'cerca de 200 m' },
]

/** Cor da água funda: é pra onde toda faixa converge antes do preto. */
const FUNDO_AGUA: [number, number, number] = [8, 22, 32]

const PROF_MAX = 320

/**
 * Passo proporcional à profundidade. Com passo fixo de 10 m o controle pularia
 * justamente a faixa onde o vermelho morre (0–15 m), que é o assunto do painel:
 * o primeiro toque já levaria pra 10 m, com 97% do vermelho ido, e a aula
 * inteira aconteceria entre dois apertos.
 */
function passoPara(profundidade: number): number {
  if (profundidade < 10) return 1
  if (profundidade < 50) return 5
  if (profundidade < 150) return 10
  return 25
}

/**
 * Quanto ainda resta dessa cor. Queda exponencial, não degrau: na água a luz
 * vai sumindo, e um degrau ensinaria a coisa errada.
 * `sumicoM` é onde resta ~5% — daí o divisor 3, porque exp(-3) ≈ 0,05.
 */
function restante(faixa: Faixa, profundidade: number): number {
  return Math.exp(-profundidade / (faixa.sumicoM / 3))
}

function misturar(cor: [number, number, number], fracao: number): string {
  const r = Math.round(FUNDO_AGUA[0] + (cor[0] - FUNDO_AGUA[0]) * fracao)
  const g = Math.round(FUNDO_AGUA[1] + (cor[1] - FUNDO_AGUA[1]) * fracao)
  const b = Math.round(FUNDO_AGUA[2] + (cor[2] - FUNDO_AGUA[2]) * fracao)
  return `rgb(${r}, ${g}, ${b})`
}

type Props = { profundidadeInicial?: number; aoFechar?: () => void }

export function PainelEspectro({ profundidadeInicial = 5, aoFechar }: Props) {
  const [profundidade, setProfundidade] = useState(() =>
    Math.max(0, Math.min(PROF_MAX, Math.round(profundidadeInicial))),
  )

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return
      // Este painel captura o teclado, então o Esc global não chega mais aqui.
      // Sem tratá-lo, o cabeçalho prometeria "esc pra fechar" e não fecharia.
      if (evento.key === 'Escape') {
        evento.preventDefault()
        aoFechar?.()
        return
      }
      if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') return
      evento.preventDefault()
      const sinal = evento.key === 'ArrowDown' ? 1 : -1
      setProfundidade((atual) => {
        // Descendo, o passo é o da faixa atual; subindo, o da faixa de baixo —
        // senão sair de 150 m subindo daria um salto de 25 e 150 nunca seria
        // alcançável de volta.
        const base = sinal > 0 ? atual : Math.max(0, atual - 0.001)
        const passo = passoPara(base) * (evento.shiftKey ? 5 : 1)
        const alvo = atual + sinal * passo
        return Math.max(0, Math.min(PROF_MAX, Math.round(alvo)))
      })
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  const vermelho = FAIXAS[0]
  const sobraVermelho = restante(vermelho, profundidade)

  return (
    <div className="espectro">
      <div className="espectro__topo">
        <span className="espectro__medida">{profundidade} m</span>
        <span className="espectro__dica">↑ sobe · ↓ desce · shift acelera</span>
      </div>

      <div className="espectro__faixas">
        {FAIXAS.map((faixa) => {
          const sobra = restante(faixa, profundidade)
          return (
            <div className="espectro__faixa" key={faixa.nome}>
              <span className="espectro__nome">{faixa.nome}</span>
              <div className="espectro__barra">
                <div
                  className="espectro__preenche"
                  style={{ background: misturar(faixa.cor, sobra) }}
                />
              </div>
              <span className="espectro__sumico">
                {sobra < 0.06 ? 'apagado' : faixa.rotulo}
              </span>
            </div>
          )
        })}
      </div>

      <div className="espectro__resultado">
        <span className="espectro__pergunta">
          a esta profundidade, um peixe vermelho parece:
        </span>
        <div
          className="espectro__amostra"
          style={{ background: misturar(vermelho.cor, sobraVermelho) }}
        />
      </div>
    </div>
  )
}
