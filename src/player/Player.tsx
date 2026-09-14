import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Cena, Roteiro } from '../roteiros/tipos'
import { Apresentacao } from '../cenas/Apresentacao'
import { Fala } from '../cenas/Fala'
import { Transicao } from '../cenas/Transicao'
import { Hud } from '../ui/Hud'
import { LogSistemas, type ModoLog } from '../ui/LogSistemas'
import { Orbe, type EstadoOrbe } from '../ui/Orbe'
import type { AudioEngine } from './AudioEngine'
import { useTeclado } from './useTeclado'

/** Tempo estimado de leitura por linha, usado quando o mp3 não existe. */
const MS_POR_LINHA_SEM_AUDIO = 2500

/** Caminho do mp3 principal da cena, quando ela tem um. */
export function audioDaCena(cena: Cena): string | null {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.audio
    case 'apresentacao':
      return cena.audio ?? null
    case 'quiz':
      return cena.audio.pergunta
    case 'vf':
      return cena.audio.afirmacao
    case 'pane':
      return cena.audio.entrada
  }
}

/** Linhas de texto da cena — só pra estimar a duração sem áudio. */
function linhasDaCena(cena: Cena): string[] {
  switch (cena.tipo) {
    case 'fala':
    case 'transicao':
      return cena.tela.linhas
    case 'apresentacao':
      return [cena.tela.titulo]
    case 'quiz':
      return [cena.pergunta]
    case 'vf':
      return [cena.afirmacao]
    case 'pane':
      return cena.falaEntrada ?? cena.subsistemas
  }
}

function rotaDaCena(cena: Cena): string {
  switch (cena.tipo) {
    case 'transicao':
      return cena.destino.toUpperCase()
    case 'fala':
    case 'apresentacao':
      return (cena.tela.titulo ?? cena.id).toUpperCase()
    default:
      return cena.id.toUpperCase()
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Props = { roteiro: Roteiro; engine: AudioEngine }

export function Player({ roteiro, engine }: Props) {
  // A pane fica no mesmo JSON, mas fora da ordem: ela é disparada pela tecla P
  // (Fase 2), então some da sequência linear que as setas percorrem.
  const sequencia = useMemo(
    () => roteiro.cenas.filter((cena) => cena.tipo !== 'pane'),
    [roteiro],
  )

  const [indice, setIndice] = useState(0)
  /** Cronômetro da legenda: só arranca quando o áudio da cena arrancou. */
  const [sinc, setSinc] = useState<{ duracaoMs: number | null; ativa: boolean }>({
    duracaoMs: null,
    ativa: false,
  })
  const [falando, setFalando] = useState(false)

  const cena = sequencia[indice]

  const avancar = useCallback(() => {
    setIndice((atual) => Math.min(atual + 1, sequencia.length - 1))
  }, [sequencia.length])

  const voltar = useCallback(() => {
    setIndice((atual) => Math.max(atual - 1, 0))
  }, [])

  // Definido antes de qualquer return: hook não pode ficar dentro do JSX que
  // só é alcançado em alguns caminhos.
  const lerNivel = useCallback(() => engine.nivel(), [engine])

  useTeclado(
    useCallback(
      (acao) => {
        switch (acao.tipo) {
          case 'avancar':
            avancar()
            break
          case 'voltar':
            voltar()
            break
          case 'pular':
            engine.pararVoz()
            avancar()
            break
          // quiz, vf, pane e overlay de ajuda entram na Fase 2.
          default:
            break
        }
      },
      [avancar, voltar, engine],
    ),
  )

  // Toca a cena atual: sfx, áudio, legenda e avanço automático.
  useEffect(() => {
    if (!cena) return

    let cancelado = false
    setSinc({ duracaoMs: null, ativa: false })
    setFalando(false)

    if (cena.sfx) engine.tocarSfx(cena.sfx)

    const url = audioDaCena(cena)
    const fallbackMs = Math.max(
      MS_POR_LINHA_SEM_AUDIO,
      linhasDaCena(cena).length * MS_POR_LINHA_SEM_AUDIO,
    )

    const executar = async () => {
      const reproducao = url ? await engine.tocar(url) : null
      if (cancelado) return

      // A legenda só existe depois que sabemos a duração real: é ela que define
      // o ritmo das linhas. Sem mp3, cai no tempo estimado.
      const duracaoMs = reproducao?.tocou ? (reproducao.duracaoMs ?? fallbackMs) : fallbackMs
      setSinc({ duracaoMs, ativa: true })
      setFalando(true)

      // Pré-decodifica só a próxima cena, pra não encher a memória de buffers.
      const proxima = sequencia[indice + 1]
      if (proxima) void engine.preparar(audioDaCena(proxima))

      if (reproducao?.tocou) await reproducao.fim
      else await esperar(fallbackMs)
      if (cancelado) return

      setFalando(false)
      if (cena.avanco === 'auto') avancar()
    }

    void executar()

    return () => {
      cancelado = true
      engine.pararVoz()
    }
  }, [cena, indice, sequencia, engine, avancar])

  if (!cena) {
    return (
      <Hud rota="FIM" profundidade={0}>
        <p className="status">expedição encerrada</p>
      </Hud>
    )
  }

  const estadoOrbe = estadoDoOrbe(cena, falando)
  // Apresentação é o único layout em que o orbe recua pro canto: a tela é dos
  // alunos, não da IA.
  const modo = cena.tipo === 'apresentacao' ? 'canto' : 'central'

  return (
    <Hud
      rota={rotaDaCena(cena)}
      // Profundidade é decorativa: desce ao longo do roteiro.
      profundidade={120 + indice * 240}
      sonar={cena.tipo === 'transicao' ? 'VARRENDO' : 'ATIVO'}
      rodapeEsquerda={`turma ${roteiro.turma}`}
      rodapeDireita={`cena ${indice + 1}/${sequencia.length} · ${cena.id}`}
    >
      <div className={`palco palco--${modo}`}>
        <div className="palco__cena">
          {/* Fica montado a sessão inteira: se trocasse de lugar na árvore a
              cada cena, a animação reiniciaria a cada troca. */}
          <Orbe
            estado={estadoOrbe}
            lerNivel={lerNivel}
            compacto={modo === 'canto'}
          />
          <div className="palco__texto">
            {conteudoDaCena(cena, sinc.duracaoMs, sinc.ativa)}
          </div>
        </div>
        <LogSistemas
          especificas={cena.log}
          modo={modoDoLog(estadoOrbe)}
          apagado={modo === 'canto'}
        />
      </div>
    </Hud>
  )
}

function estadoDoOrbe(cena: Cena, falando: boolean): EstadoOrbe {
  switch (cena.tipo) {
    case 'pane':
      return 'pane'
    case 'quiz':
    case 'vf':
      return 'processando'
    case 'apresentacao':
      return 'ocioso'
    default:
      return falando ? 'falando' : 'ocioso'
  }
}

function modoDoLog(estado: EstadoOrbe): ModoLog {
  if (estado === 'pane') return 'erro'
  if (estado === 'processando') return 'rapido'
  return 'normal'
}

function conteudoDaCena(cena: Cena, duracaoMs: number | null, ativa: boolean) {
  // O `key` por id garante que cada cena começa com estado limpo: sem ele, duas
  // falas seguidas reaproveitam o mesmo componente e a legenda herda a posicao
  // da cena anterior.
  switch (cena.tipo) {
    case 'fala':
      return <Fala key={cena.id} cena={cena} duracaoMs={duracaoMs} ativa={ativa} />
    case 'apresentacao':
      return <Apresentacao key={cena.id} cena={cena} />
    case 'transicao':
      return <Transicao key={cena.id} cena={cena} duracaoMs={duracaoMs} ativa={ativa} />
    default:
      // quiz, vf e pane chegam na Fase 2.
      return <p className="pendente">cena "{cena.tipo}" — a implementar (Fase 2)</p>
  }
}
