import { useEffect, useRef } from 'react'
import fichas from '../roteiros/fichas.json'
import type { EspecieIdentificacao } from '../roteiros/tipos'
import { quadroSeguro } from '../ui/falhas'

/**
 * Expedição de identificação: a plateia diz o nome, a água limpa.
 *
 * O quiz que isto substitui perguntava e esperava uma letra. Aqui não há
 * alternativa nem erro: há uma silhueta na água suja e uma sala tentando
 * reconhecer. O que muda com o tempo não é a chance de acertar, é o TAMANHO da
 * recompensa — e a recompensa é ver o bicho.
 *
 * Esta tela é só o HUD. O animal e a turbidez são desenhados pelo motor do
 * mundo, dentro da câmera, porque a água suja tem que borrar o bicho junto com
 * o resto do quadro: nítido atrás de um vidro embaçado, ele se entregaria.
 */

export type FaseIdent = 'procurando' | 'revelado' | 'fim'

export type EstadoIdent = {
  fase: FaseIdent
  /** Índice da espécie atual. */
  indice: number
  /** Quantas pistas já foram ditas (0 a 3). */
  pistas: number
  /** 0 a 1. Cai com o tempo e estaciona em 1/3 na última pista. */
  calibracao: number
  /** A tripulação acertou, ou o operador revelou? */
  acertou: boolean
}

/** Onde a barra para: depois da última pista não cai mais. */
export const PISO_CALIBRACAO = 1 / 3

type Props = {
  especie: EspecieIdentificacao
  estado: EstadoIdent
  total: number
  /** Lê a calibração viva. Função, não valor: ela muda a cada quadro. */
  lerCalibracao: () => number
}

type Ficha = { titulo: string; dados: Record<string, string> }
const FICHAS = fichas as Record<string, Ficha>

export function Identificacao({ especie, estado, total, lerCalibracao }: Props) {
  const revelado = estado.fase !== 'procurando'
  const ficha = FICHAS[especie.id]

  return (
    <div className="ident" data-fase={estado.fase}>
      <div className="ident__topo">
        <header className="ident__cabecalho">
        <span className="ident__contagem">
          espécie {estado.indice + 1} de {total}
        </span>
        <span className="ident__dica">
          {revelado ? 'registro gravado' : 'enter confirma · x revela'}
        </span>
        </header>
        <Calibracao lerCalibracao={lerCalibracao} congelada={revelado} />
      </div>

      {!revelado && (
        <ol className="ident__pistas">
          {especie.pistas.slice(0, estado.pistas).map((pista, i) => (
            <li key={pista} className={i === estado.pistas - 1 ? 'ident__pista--nova' : undefined}>
              {pista}
            </li>
          ))}
        </ol>
      )}

      {revelado && (
        <div className="ident__revelacao">
          <h3 className="ident__nome">{ficha?.titulo ?? especie.nome}</h3>
          {!estado.acertou && <p className="ident__sem-acerto">sem confirmação da tripulação</p>}
          {/* As pistas continuam na tela na revelação, ao lado do bicho: é
              aqui que a sala liga o que ouviu ao que está vendo. Sumir com
              elas na hora do acerto jogaria fora justamente essa ligação. */}
          {estado.pistas > 0 && (
            <ul className="ident__pistas-ditas">
              {especie.pistas.slice(0, estado.pistas).map((pista) => (
                <li key={pista}>{pista}</li>
              ))}
            </ul>
          )}
          {ficha && (
            <dl className="ident__ficha">
              {Object.entries(ficha.dados)
                .slice(0, 4)
                .map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <dt>{rotulo}</dt>
                    <dd>{valor}</dd>
                  </div>
                ))}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A barra de calibração.
 *
 * É o único relógio da cena, e de propósito ela não é um cronômetro: não tem
 * número, não pisca, não alarma. Cai devagar enquanto a sala pensa e PARA no
 * terço final — quem demorou perde tamanho de recompensa, não perde a vez.
 *
 * Escreve no DOM por `requestAnimationFrame`: como estado, seria um render da
 * árvore inteira por quadro.
 */
function Calibracao({
  lerCalibracao,
  congelada,
}: {
  lerCalibracao: () => number
  congelada: boolean
}) {
  const refNivel = useRef<HTMLSpanElement>(null)
  const refCaixa = useRef<HTMLDivElement>(null)
  const refLer = useRef(lerCalibracao)
  refLer.current = lerCalibracao
  const refCongelada = useRef(congelada)
  refCongelada.current = congelada

  useEffect(() => {
    let quadro = 0
    const passo = quadroSeguro('calibração', () => {
      quadro = requestAnimationFrame(passo)
      const v = Math.max(0, Math.min(1, refLer.current()))
      if (refNivel.current) refNivel.current.style.width = `${v * 100}%`
      refCaixa.current?.classList.toggle('ident__calibracao--piso', v <= PISO_CALIBRACAO + 0.01)
    })
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [])

  return (
    <div className="ident__calibracao" ref={refCaixa}>
      <span className="ident__calibracao-rotulo">Calibração</span>
      <span className="ident__calibracao-trilho">
        <span className="ident__calibracao-nivel" ref={refNivel} />
      </span>
    </div>
  )
}
