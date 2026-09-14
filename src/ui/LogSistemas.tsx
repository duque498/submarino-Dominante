import { useEffect, useRef, useState } from 'react'
import { sortearErro, sortearGenerico } from './logPool'

export type ModoLog = 'normal' | 'rapido' | 'erro'

type Props = {
  /** Linhas da cena atual (campo `log` do JSON), intercaladas com as genéricas. */
  especificas?: string[]
  modo?: ModoLog
  /** Nas apresentações o painel recua pra não competir com os alunos. */
  apagado?: boolean
}

const MAX_LINHAS = 18
/** Ritmo de cada modo, em ms. Sorteado dentro da faixa a cada linha. */
const RITMOS: Record<ModoLog, [number, number]> = {
  normal: [800, 2500],
  rapido: [150, 400],
  erro: [150, 400],
}
/** Chance de puxar da fila da cena em vez do pool genérico. */
const CHANCE_ESPECIFICA = 0.45

type Linha = { id: number; hora: string; texto: string; erro: boolean }

/** Quantas linhas o painel ja mostra no primeiro quadro. */
const LINHAS_INICIAIS = 7

const horaEm = (deslocamentoMs = 0) =>
  new Date(Date.now() + deslocamentoMs).toLocaleTimeString('pt-BR', { hour12: false })

/**
 * Semeia o painel pra que ele apareça com histórico. Sem isso o log nasce vazio
 * e leva uns 15 s pra encher, o que na abertura da apresentação parece defeito.
 */
function semear(): Linha[] {
  return Array.from({ length: LINHAS_INICIAIS }, (_, i) => ({
    id: i,
    hora: horaEm(-(LINHAS_INICIAIS - i) * 1700),
    texto: sortearGenerico(),
    erro: false,
  }))
}

/** Painel cenográfico: nada aqui reflete estado real do sistema. */
export function LogSistemas({ especificas, modo = 'normal', apagado = false }: Props) {
  const [linhas, setLinhas] = useState<Linha[]>(semear)
  const proximoId = useRef(LINHAS_INICIAIS)
  const fila = useRef<string[]>([])

  // Cada cena traz sua própria fila de linhas específicas.
  useEffect(() => {
    fila.current = especificas ? [...especificas] : []
  }, [especificas])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const [min, max] = RITMOS[modo]

    const emitir = () => {
      const usarEspecifica =
        fila.current.length > 0 && (modo !== 'erro') && Math.random() < CHANCE_ESPECIFICA

      const texto = usarEspecifica
        ? fila.current.shift()!
        : modo === 'erro'
          ? sortearErro()
          : sortearGenerico()

      setLinhas((atuais) =>
        [
          ...atuais,
          {
            id: proximoId.current++,
            hora: horaEm(),
            texto,
            erro: modo === 'erro' && !usarEspecifica,
          },
        ].slice(-MAX_LINHAS),
      )

      timer = setTimeout(emitir, min + Math.random() * (max - min))
    }

    timer = setTimeout(emitir, min + Math.random() * (max - min))
    return () => clearTimeout(timer)
  }, [modo])

  const classes = ['log', apagado && 'log--apagado', modo === 'erro' && 'log--erro']
    .filter(Boolean)
    .join(' ')

  return (
    <aside className={classes} aria-hidden="true">
      <h2 className="log__titulo">log de sistemas</h2>
      <ol className="log__lista">
        {linhas.map((linha) => (
          <li key={linha.id} className={linha.erro ? 'log__linha log__linha--erro' : 'log__linha'}>
            <span className="log__hora">[{linha.hora}]</span> {linha.texto}
          </li>
        ))}
      </ol>
    </aside>
  )
}
